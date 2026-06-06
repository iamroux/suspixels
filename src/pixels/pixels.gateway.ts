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
import { ChatService } from '../chat/chat.service';

interface ExtWebSocket extends WebSocket {
  lastSeen: number;
}

interface ClientInfo {
  userId: string | null; // null for guests / not-yet-identified
  name: string; // '' for not-yet-identified
  avatarStyle: string | null;
}

@WebSocketGateway({
  cors: true,
  transports: ['websocket', 'polling'],
})
export class WebsocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(WebsocketGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly chatService: ChatService,
  ) {}

  @WebSocketServer()
  server: Server;

  private clients: Map<WebSocket, ClientInfo> = new Map();
  private historySent: WeakSet<WebSocket> = new WeakSet();

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
        if (
          ws.readyState !== WebSocket.OPEN ||
          (ws.lastSeen && now - ws.lastSeen > 35000)
        ) {
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
    if (this.pendingUpdates.length === 0 && this.pendingDeletes.length === 0)
      return;

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
    client.on('error', (e) =>
      this.logger.warn(`WS client error: ${e.message}`),
    );

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
          initialAvatarStyle = user
            ? user.avatarStyle
            : payload.avatarStyle || null;
          this.logger.log(`Authenticated WS client via cookie: ${initialName}`);
        } catch (e) {
          this.logger.warn(`Invalid WS cookie token: ${e.message}`);
        }
      }
    }

    this.clients.set(client, {
      userId: initialUserId,
      name: initialName,
      avatarStyle: initialAvatarStyle,
    });

    client.on('message', async (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === 'identify') {
          if (msg.token) {
            try {
              const payload = this.jwtService.verify(msg.token);
              const user = await this.usersService.findById(payload.sub);
              const verified = user
                ? user.name
                : payload.name || msg.name?.trim().slice(0, 40) || 'User';
              const avatarStyle = user
                ? user.avatarStyle
                : payload.avatarStyle || msg.avatarStyle || 'bottts';
              this.logger.log(
                `Authenticated WS client via identify token: ${verified}`,
              );
              this.clients.set(client, {
                userId: payload.sub ?? null,
                name: verified,
                avatarStyle,
              });
              await this.afterIdentify(client);
              return;
            } catch {
              // token invalid — fall through
            }
          }
          // Cookie already authed us — re-broadcast without downgrading to guest.
          if (initialUserId) {
            await this.afterIdentify(client);
            return;
          }
          let base = msg.name?.trim().slice(0, 40) || '';
          // A guest may not wear a registered account's name — prevents
          // impersonation and stops stale-localStorage profiles from showing
          // up as "<owner> (Guest)". Fall back to a random guest tag.
          let taken = false;
          if (base) {
            try {
              taken = !!(await this.usersService.findByName(base));
            } catch {
              // lookup failure is non-fatal; treat as not taken
            }
          }
          if (!base || taken) {
            base = 'Guest_' + Math.random().toString(36).slice(2, 8);
          }
          const name = `${base} (Guest)`;
          const avatarStyle = msg.avatarStyle || 'bottts';
          this.logger.log(`Guest identified: ${name}`);
          this.clients.set(client, { userId: null, name, avatarStyle });
          await this.afterIdentify(client);
        } else if (msg?.type === 'chat_send') {
          await this.handleChatSend(client, msg);
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
              if (
                otherClient !== client &&
                otherClient.readyState === WebSocket.OPEN
              ) {
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

  private async afterIdentify(client: WebSocket) {
    this.broadcastUserCount();
    if (this.historySent.has(client)) return;
    this.historySent.add(client);
    try {
      const messages = await this.chatService.getRecent();
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'chat_history', messages }));
      }
    } catch (e: any) {
      this.logger.warn(`Failed to send chat history: ${e?.message ?? e}`);
    }
  }

  private sendToClient(client: WebSocket, payload: object) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  }

  private broadcastChatMessage(payload: object) {
    const data = JSON.stringify({ type: 'chat_message', ...payload });
    this.clients.forEach((_info, client) => {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    });
  }

  private async handleChatSend(client: WebSocket, msg: any) {
    const info = this.clients.get(client);
    if (!info || !info.userId) {
      this.sendToClient(client, {
        type: 'chat_error',
        code: 'guests_cannot_send',
      });
      return;
    }
    const body = typeof msg?.body === 'string' ? msg.body.trim() : '';
    if (body.length === 0) return;
    if (body.length > 500) {
      this.sendToClient(client, { type: 'chat_error', code: 'too_long' });
      return;
    }
    // If the body is a GIF token, validate it's actually a Giphy CDN URL
    const gifMatch = body.match(/^\[gif:([^\]]+)\]$/);
    if (gifMatch) {
      try {
        const gifUrl = new URL(gifMatch[1]);
        if (!/^media[0-9]*\.giphy\.com$/.test(gifUrl.hostname)) {
          this.sendToClient(client, { type: 'chat_error', code: 'invalid_gif' });
          return;
        }
      } catch {
        this.sendToClient(client, { type: 'chat_error', code: 'invalid_gif' });
        return;
      }
    }
    let prestigeCount = 0;
    try {
      prestigeCount = await this.usersService.getPixelCount(info.userId);
    } catch {
      // non-fatal; prestige stays 0
    }
    try {
      const payload = await this.chatService.sendMessage({
        userId: info.userId,
        username: info.name,
        avatarStyle: info.avatarStyle ?? 'bottts',
        prestigeCount,
        body,
      });
      this.broadcastChatMessage(payload);
    } catch (e: any) {
      this.logger.error(`Failed to send chat message: ${e?.message ?? e}`);
      this.sendToClient(client, { type: 'chat_error', code: 'server_error' });
    }
  }
}
