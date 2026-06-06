import { Injectable, Logger, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';

export const CHAT_HISTORY_LIMIT = 200;
const REDIS_RECENT_KEY = 'chat:recent';

export interface ChatMessagePayload {
  id: string;
  userId: string | null;
  username: string;
  avatarStyle: string;
  prestigeCount: number;
  body: string;
  createdAt: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // Chat lives entirely in Redis: a single capped list of the most recent
  // messages. No database — messages are ephemeral and only reset if Redis
  // itself is wiped. id/createdAt are generated here (previously the DB did it).
  async sendMessage(params: {
    userId: string;
    username: string;
    avatarStyle: string;
    prestigeCount: number;
    body: string;
  }): Promise<ChatMessagePayload> {
    const payload: ChatMessagePayload = {
      id: randomUUID(),
      userId: params.userId ?? null,
      username: params.username,
      avatarStyle: params.avatarStyle,
      prestigeCount: params.prestigeCount,
      body: params.body,
      createdAt: new Date().toISOString(),
    };
    try {
      await this.redis.lpush(REDIS_RECENT_KEY, JSON.stringify(payload));
      await this.redis.ltrim(REDIS_RECENT_KEY, 0, CHAT_HISTORY_LIMIT - 1);
    } catch (e: any) {
      // Non-fatal: the live broadcast still happens, the message just isn't
      // persisted into recent history.
      this.logger.warn(
        `Redis lpush failed (message not stored): ${e?.message ?? e}`,
      );
    }
    return payload;
  }

  async getRecent(limit = CHAT_HISTORY_LIMIT): Promise<ChatMessagePayload[]> {
    try {
      const cached = await this.redis.lrange(REDIS_RECENT_KEY, 0, limit - 1);
      return cached
        .map((raw) => {
          try {
            return JSON.parse(raw) as ChatMessagePayload;
          } catch {
            return null;
          }
        })
        .filter((m): m is ChatMessagePayload => m !== null)
        .reverse();
    } catch (e: any) {
      this.logger.warn(`Redis lrange failed: ${e?.message ?? e}`);
      return [];
    }
  }
}
