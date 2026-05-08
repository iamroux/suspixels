import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: true,
  transports: ['websocket', 'polling'],
})
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(WebsocketGateway.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  @WebSocketServer()
  server: Server;

  private clients: Map<WebSocket, string> = new Map();

  private parseCookies(cookieHeader: string): Record<string, string> {
    return Object.fromEntries(
      cookieHeader
        .split(';')
        .map((c) => c.trim().split('='))
        .filter((parts) => parts.length >= 2)
        .map(([k, ...v]) => [k.trim(), v.join('=').trim()]),
    );
  }

  handleConnection(client: WebSocket, request: IncomingMessage) {
    this.logger.log('New client connected');

    // Attempt auth from cookie sent on WS upgrade request
    let initialName = '';
    const cookieHeader = request?.headers?.cookie || '';
    if (cookieHeader) {
      const cookies = this.parseCookies(cookieHeader);
      const token = cookies['access_token'];
      if (token) {
        try {
          const payload = this.jwtService.verify(token);
          initialName = payload.name;
          this.logger.log(`Authenticated WS client via cookie: ${initialName}`);
        } catch (e) {
          this.logger.warn(`Invalid WS cookie token: ${e.message}`);
        }
      }
    }

    this.clients.set(client, initialName);

    client.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === 'identify') {
          // If already authenticated via cookie, ignore the identify message
          if (initialName) {
            this.broadcastUserCount();
            return;
          }

          // Guest flow: accept name from client (no token accepted here)
          const name = `${msg.name?.trim().slice(0, 40) || 'Guest'} (Guest)`;
          this.logger.log(`Guest identified: ${name}`);
          this.clients.set(client, name);
          this.broadcastUserCount();
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
    const names = Array.from(
      new Set(Array.from(this.clients.values()).filter((n) => n && n.length > 0)),
    ).sort((a, b) => a.localeCompare(b));
    const userCount = names.length || this.clients.size;
    const message = JSON.stringify({
      type: 'user_count',
      count: userCount,
      names,
    });

    this.clients.forEach((_name, client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  broadcastPixelUpdate(pixel: any) {
    const message = JSON.stringify({
      type: 'pixel_update',
      ...pixel,
    });

    this.clients.forEach((_name, client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  broadcastPixelDelete(x: number, y: number) {
    const message = JSON.stringify({
      type: 'pixel_delete',
      x,
      y,
    });

    this.clients.forEach((_name, client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  @SubscribeMessage('message')
  handleMessage(client: WebSocket, payload: any): void {
    this.logger.log('Received message:', payload);
  }
}
