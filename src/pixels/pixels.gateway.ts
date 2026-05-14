import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

interface ExtWebSocket extends WebSocket {
  lastSeen: number;
}

@WebSocketGateway({
  cors: true,
  transports: ['websocket', 'polling'],
})
export class WebsocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(WebsocketGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  @WebSocketServer()
  server: Server;

  private clients: Map<WebSocket, string> = new Map();

  // Fix 16: batch buffer — collect all updates within a single event loop tick
  private pendingUpdates: any[] = [];
  private pendingDeletes: { x: number; y: number }[] = [];
  private flushScheduled = false;

  afterInit() {
    // Evict clients that haven't sent a heartbeat in 35 seconds.
    // We rely on the CLIENT sending pings because Render's proxy intercepts
    // server-side pings and responds on behalf of dead browsers.
    setInterval(() => {
      const now = Date.now();
      let changed = false;
      this.clients.forEach((_name, ws: ExtWebSocket) => {
        if (ws.readyState !== WebSocket.OPEN || (ws.lastSeen && now - ws.lastSeen > 35000)) {
          ws.terminate();
          this.clients.delete(ws);
          changed = true;
        }
      });
      if (changed) this.broadcastUserCount();
    }, 10000);
  }

  // Fix 17: listen to domain events emitted by PixelsService
  @OnEvent('pixel.updated')
  handlePixelUpdated(pixel: any) {
    this.pendingUpdates.push(pixel);
    this.scheduleFlush();
  }

  @OnEvent('pixel.deleted')
  handlePixelDeleted(data: { x: number; y: number }) {
    this.pendingDeletes.push(data);
    this.scheduleFlush();
  }

  // Fix 16: defer the actual send to after the current tick so rapid events
  // (e.g. batch uploads) are merged into one message per client
  private scheduleFlush() {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    setImmediate(() => this.flushBroadcast());
  }

  private flushBroadcast() {
    this.flushScheduled = false;
    if (this.pendingUpdates.length === 0 && this.pendingDeletes.length === 0) return;

    const updates = this.pendingUpdates.splice(0);
    const deletes = this.pendingDeletes.splice(0);

    const message = JSON.stringify({ type: 'batch_update', updates, deletes });

    this.clients.forEach((_name, client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  private parseCookies(cookieHeader: string): Record<string, string> {
    return Object.fromEntries(
      cookieHeader
        .split(';')
        .map((c) => c.trim().split('='))
        .filter((parts) => parts.length >= 2)
        .map(([k, ...v]) => [k.trim(), v.join('=').trim()]),
    );
  }

  async handleConnection(client: ExtWebSocket, request: IncomingMessage) {
    this.logger.log('New client connected');
    client.lastSeen = Date.now();

    // Disconnect cleanup runs in handleDisconnect (fires on 'close', including
    // after a socket error). This listener exists only so an 'error' event
    // can't crash the process for lack of a handler.
    client.on('error', (e) => this.logger.warn(`WS client error: ${e.message}`));

    let initialName = '';
    const cookieHeader = request?.headers?.cookie || '';
    if (cookieHeader) {
      const token = this.parseCookies(cookieHeader)['access_token'];
      if (token) {
        try {
          const payload = this.jwtService.verify(token);
          const user = await this.usersService.findById(payload.sub);
          initialName = user ? user.name : payload.name;
          this.logger.log(`Authenticated WS client via cookie: ${initialName}`);
        } catch (e) {
          this.logger.warn(`Invalid WS cookie token: ${e.message}`);
        }
      }
    }

    this.clients.set(client, initialName);

    client.on('message', async (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === 'identify') {
          if (msg.token) {
            try {
              const payload = this.jwtService.verify(msg.token);
              const user = await this.usersService.findById(payload.sub);
              const verified = user ? user.name : (payload.name || msg.name?.trim().slice(0, 40) || 'User');
              this.logger.log(`Authenticated WS client via identify token: ${verified}`);
              this.clients.set(client, verified);
              this.broadcastUserCount();
              return;
            } catch {
              // token invalid — fall through
            }
          }
          if (initialName) { this.broadcastUserCount(); return; }
          const name = `${msg.name?.trim().slice(0, 40) || 'Guest'} (Guest)`;
          this.logger.log(`Guest identified: ${name}`);
          this.clients.set(client, name);
          this.broadcastUserCount();
        } else if (msg?.type === 'ping') {
          client.lastSeen = Date.now();
        }
      } catch (e) {
        this.logger.error(`Error handling message: ${e.message}`);
      }
    });

    this.broadcastUserCount();
  }

  handleDisconnect(client: WebSocket) {
    this.logger.log('Client disconnected');
    this.clients.delete(client);
    this.broadcastUserCount();
  }

  private broadcastUserCount() {
    // names = de-duplicated list of identified users (drives the popover).
    // count = every open socket, including clients that haven't identified
    // yet — otherwise a lone unidentified client shows as "0 online".
    const names = Array.from(
      new Set(Array.from(this.clients.values()).filter((n) => n?.length > 0)),
    ).sort((a, b) => a.localeCompare(b));
    const message = JSON.stringify({
      type: 'user_count',
      count: this.clients.size,
      names,
    });
    this.clients.forEach((_name, client) => {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    });
  }
}
