import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

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

  private clients: Map<WebSocket, { name: string; avatarStyle: string; pixelCount: number; isAlive: boolean }> = new Map();

  // Fix 16: batch buffer — collect all updates within a single event loop tick
  private pendingUpdates: any[] = [];
  private pendingDeletes: { x: number; y: number }[] = [];
  private flushScheduled = false;

  afterInit() {
    setInterval(() => {
      let changed = false;
      this.clients.forEach((info, client) => {
        if (!info.isAlive || client.readyState !== WebSocket.OPEN) {
          client.terminate();
          this.clients.delete(client);
          changed = true;
        } else {
          info.isAlive = false;
          client.ping();
        }
      });
      if (changed) this.broadcastUserCount();
    }, 15000); // Check every 15 seconds
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

    this.clients.forEach((_info, client) => {
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

  async handleConnection(client: WebSocket, request: IncomingMessage) {
    this.logger.log('New client connected');

    let initialName = '';
    let initialAvatar = 'bottts';
    let initialCount = 0;
    const cookieHeader = request?.headers?.cookie || '';
    if (cookieHeader) {
      const token = this.parseCookies(cookieHeader)['access_token'];
      if (token) {
        try {
          const payload = this.jwtService.verify(token);
          const user = await this.usersService.findById(payload.sub);
          if (user) {
            initialName = user.name;
            initialAvatar = user.avatarStyle || 'bottts';
            initialCount = await this.usersService.getPixelCount(user.id);
          } else {
            initialName = payload.name;
          }
          this.logger.log(`Authenticated WS client via cookie: ${initialName}`);
        } catch (e) {
          this.logger.warn(`Invalid WS cookie token: ${e.message}`);
        }
      }
    }

    this.clients.set(client, { name: initialName, avatarStyle: initialAvatar, pixelCount: initialCount, isAlive: true });

    client.on('pong', () => {
      const info = this.clients.get(client);
      if (info) info.isAlive = true;
    });

    client.on('message', async (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === 'identify') {
          if (msg.token) {
            try {
              const payload = this.jwtService.verify(msg.token);
              const user = await this.usersService.findById(payload.sub);
              const verified = user ? user.name : (payload.name || msg.name?.trim().slice(0, 40) || 'User');
              const avatarStyle = user ? user.avatarStyle || 'bottts' : 'bottts';
              const pixelCount = user ? await this.usersService.getPixelCount(user.id) : 0;
              this.logger.log(`Authenticated WS client via identify token: ${verified}`);
              this.clients.set(client, { name: verified, avatarStyle, pixelCount, isAlive: true });
              this.broadcastUserCount();
              return;
            } catch {
              // token invalid — fall through
            }
          }
          if (initialName) { this.broadcastUserCount(); return; }
          const name = `${msg.name?.trim().slice(0, 40) || 'Guest'} (Guest)`;
          this.logger.log(`Guest identified: ${name}`);
          this.clients.set(client, { name, avatarStyle: 'bottts', pixelCount: 0, isAlive: true });
          this.broadcastUserCount();
        } else if (msg?.type === 'cursor_move') {
          const info = this.clients.get(client);
          if (info && info.name) {
            const outMsg = JSON.stringify({
              type: 'cursor_update',
              name: info.name,
              avatarStyle: info.avatarStyle,
              pixelCount: info.pixelCount,
              x: msg.x,
              y: msg.y,
              tool: msg.tool
            });
            this.clients.forEach((_v, otherClient) => {
              if (otherClient !== client && otherClient.readyState === WebSocket.OPEN) {
                otherClient.send(outMsg);
              }
            });
          }
        }
      } catch (e) {
        this.logger.error(`Error handling message: ${e.message}`);
      }
    });

    client.on('close', () => {
      this.logger.log('Client connection closed');
      this.clients.delete(client);
      this.broadcastUserCount();
    });

    client.on('error', () => {
      this.clients.delete(client);
      this.broadcastUserCount();
    });

    this.broadcastUserCount();
  }

  handleDisconnect(client: WebSocket) {
    this.logger.log('Client disconnected');
    this.clients.delete(client);
    this.broadcastUserCount();
  }

  private broadcastUserCount() {
    const names = Array.from(
      new Set(Array.from(this.clients.values()).filter((v) => v?.name?.length > 0).map(v => v.name)),
    ).sort((a, b) => a.localeCompare(b));
    const message = JSON.stringify({
      type: 'user_count',
      count: names.length || this.clients.size,
      names,
    });
    this.clients.forEach((_v, client) => {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    });
  }

  @SubscribeMessage('message')
  handleMessage(_client: WebSocket, payload: any): void {
    this.logger.log('Received message:', payload);
  }
}
