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

interface ClientInfo {
  userId: string | null; // null for guests / not-yet-identified
  name: string;          // '' for not-yet-identified
  avatarStyle: string | null;
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

  private clients: Map<WebSocket, ClientInfo> = new Map();

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
      this.clients.forEach((_info, ws: ExtWebSocket) => {
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

  async handleConnection(client: ExtWebSocket, request: IncomingMessage) {
    this.logger.log('New client connected');
    client.lastSeen = Date.now();

    // Disconnect cleanup runs in handleDisconnect (fires on 'close', including
    // after a socket error). This listener exists only so an 'error' event
    // can't crash the process for lack of a handler.
    client.on('error', (e) => this.logger.warn(`WS client error: ${e.message}`));

    let initialName = '';
    let initialUserId: string | null = null;
    let initialAvatarStyle: string | null = null;
    const cookieHeader = request?.headers?.cookie || '';
    if (cookieHeader) {
      const token = this.parseCookies(cookieHeader)['access_token'];
      if (token) {
        try {
          const payload = this.jwtService.verify(token);
          const user = await this.usersService.findById(payload.sub);
          initialName = user ? user.name : payload.name;
          initialUserId = payload.sub ?? null;
          initialAvatarStyle = user ? user.avatarStyle : (payload.avatarStyle || null);
          this.logger.log(`Authenticated WS client via cookie: ${initialName}`);
        } catch (e) {
          this.logger.warn(`Invalid WS cookie token: ${e.message}`);
        }
      }
    }

    this.clients.set(client, { userId: initialUserId, name: initialName, avatarStyle: initialAvatarStyle });

    client.on('message', async (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === 'identify') {
          if (msg.token) {
            try {
              const payload = this.jwtService.verify(msg.token);
              const user = await this.usersService.findById(payload.sub);
              const verified = user ? user.name : (payload.name || msg.name?.trim().slice(0, 40) || 'User');
              const avatarStyle = user ? user.avatarStyle : (payload.avatarStyle || msg.avatarStyle || 'bottts');
              this.logger.log(`Authenticated WS client via identify token: ${verified}`);
              this.clients.set(client, { userId: payload.sub ?? null, name: verified, avatarStyle });
              this.broadcastUserCount();
              return;
            } catch {
              // token invalid — fall through
            }
          }
          // Cookie already authed us — re-broadcast without downgrading to guest.
          if (initialUserId) { this.broadcastUserCount(); return; }
          const name = `${msg.name?.trim().slice(0, 40) || 'Guest'} (Guest)`;
          const avatarStyle = msg.avatarStyle || 'bottts';
          this.logger.log(`Guest identified: ${name}`);
          this.clients.set(client, { userId: null, name, avatarStyle });
          this.broadcastUserCount();
        } else if (msg?.type === 'cursor_move') {
          const clientInfo = this.clients.get(client);
          if (clientInfo && clientInfo.name) {
            const cursorMsg = JSON.stringify({
              type: 'cursor_move',
              userId: clientInfo.userId || clientInfo.name, // Use name as fallback ID for guests
              name: clientInfo.name,
              avatarStyle: clientInfo.avatarStyle,
              x: msg.x,
              y: msg.y,
            });
            this.clients.forEach((_info, otherClient) => {
              if (otherClient !== client && otherClient.readyState === WebSocket.OPEN) {
                otherClient.send(cursorMsg);
              }
            });
          }
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
    // Dedup logged-in users by userId (robust against name changes mid-session
    // and against one tab still pre-identify while another is named).
    // Guests dedup by name (same browser → same Guest_xyz across tabs).
    // Truly anonymous sockets (never identified — cookie path failed AND no
    // identify message ever arrived, e.g. a Safari tab whose localStorage
    // doesn't have pixelUser/authToken) are NOT counted here, otherwise the
    // same person on a second device shows as "2 online" with one ghost
    // entry that isn't in the names list. The frontend ensures a lone
    // visitor still sees "1 online".
    const seenUserIds = new Set<string>();
    const namesSet = new Set<string>();

    this.clients.forEach((info) => {
      if (info.userId) {
        if (seenUserIds.has(info.userId)) return;
        seenUserIds.add(info.userId);
        if (info.name) namesSet.add(info.name);
      } else if (info.name) {
        namesSet.add(info.name);
      }
    });

    const names = Array.from(namesSet).sort((a, b) => a.localeCompare(b));
    const message = JSON.stringify({
      type: 'user_count',
      count: names.length,
      names,
    });
    this.clients.forEach((_info, client) => {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    });
  }
}
