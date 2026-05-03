import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: true,
  transports: ['websocket', 'polling'],
})
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(WebsocketGateway.name);
  
  constructor(private readonly configService: ConfigService) {}

  @WebSocketServer()
  server: Server;

  private clients: Map<WebSocket, string> = new Map();

  handleConnection(client: WebSocket) {
    this.logger.log('New client connected');
    this.clients.set(client, '');
    client.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === 'identify' && typeof msg.name === 'string') {
          this.clients.set(client, msg.name.trim().slice(0, 40));
          this.broadcastUserCount();
        }
      } catch {}
    });
    this.broadcastUserCount();
  }

  handleDisconnect(client: WebSocket) {
    this.logger.log('Client disconnected');
    this.clients.delete(client);
    this.broadcastUserCount();
  }

  private broadcastUserCount() {
    const names = Array.from(new Set(
      Array.from(this.clients.values()).filter((n) => n && n.length > 0)
    )).sort((a, b) => a.localeCompare(b));
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
