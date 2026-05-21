import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { ChatMessage } from './entities/chat-message.entity';

export const CHAT_HISTORY_LIMIT = 200;
export const CHAT_RATE_LIMIT_COUNT = 5;
export const CHAT_RATE_LIMIT_WINDOW_SEC = 10;
const REDIS_RECENT_KEY = 'chat:recent';
const REDIS_RATE_KEY = (userId: string) => `chat:rl:${userId}`;

export type ChatRateLimitResult =
  | { ok: true }
  | { ok: false; retryAfter: number };

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

  constructor(
    @InjectRepository(ChatMessage)
    private readonly chatRepository: Repository<ChatMessage>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async sendMessage(params: {
    userId: string;
    username: string;
    avatarStyle: string;
    prestigeCount: number;
    body: string;
  }): Promise<ChatMessagePayload> {
    const row = this.chatRepository.create({
      userId: params.userId,
      username: params.username,
      avatarStyle: params.avatarStyle,
      prestigeCount: params.prestigeCount,
      body: params.body,
    });
    const saved = await this.chatRepository.save(row);
    const payload = this.toPayload(saved);
    try {
      await this.redis.lpush(REDIS_RECENT_KEY, JSON.stringify(payload));
      await this.redis.ltrim(REDIS_RECENT_KEY, 0, CHAT_HISTORY_LIMIT - 1);
    } catch (e: any) {
      this.logger.warn(`Redis lpush failed (non-fatal): ${e?.message ?? e}`);
    }
    return payload;
  }

  async getRecent(limit = CHAT_HISTORY_LIMIT): Promise<ChatMessagePayload[]> {
    try {
      const cached = await this.redis.lrange(REDIS_RECENT_KEY, 0, limit - 1);
      if (cached.length > 0) {
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
      }
    } catch (e: any) {
      this.logger.warn(
        `Redis lrange failed, falling back to DB: ${e?.message ?? e}`,
      );
    }
    const rows = await this.chatRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
    const payloads = rows.map((r) => this.toPayload(r));
    if (payloads.length > 0) {
      try {
        const pipeline = this.redis.pipeline();
        pipeline.del(REDIS_RECENT_KEY);
        for (const p of payloads) {
          pipeline.rpush(REDIS_RECENT_KEY, JSON.stringify(p));
        }
        await pipeline.exec();
      } catch (e: any) {
        this.logger.warn(
          `Redis cache warm failed (non-fatal): ${e?.message ?? e}`,
        );
      }
    }
    return payloads.reverse();
  }

  async deleteMessage(id: string): Promise<void> {
    await this.chatRepository.delete(id);
    try {
      await this.redis.del(REDIS_RECENT_KEY);
    } catch (e: any) {
      this.logger.warn(`Redis del failed (non-fatal): ${e?.message ?? e}`);
    }
  }

  async checkRateLimit(userId: string): Promise<ChatRateLimitResult> {
    const key = REDIS_RATE_KEY(userId);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, CHAT_RATE_LIMIT_WINDOW_SEC);
    }
    if (count > CHAT_RATE_LIMIT_COUNT) {
      const ttl = await this.redis.ttl(key);
      return { ok: false, retryAfter: Math.max(ttl, 1) };
    }
    return { ok: true };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async prune(): Promise<number> {
    const result = await this.chatRepository
      .createQueryBuilder()
      .delete()
      .from(ChatMessage)
      .where(
        `id IN (SELECT id FROM chat_messages ORDER BY created_at DESC OFFSET :limit)`,
        { limit: CHAT_HISTORY_LIMIT },
      )
      .execute();
    const deleted = result.affected ?? 0;
    if (deleted > 0) {
      this.logger.log(`Pruned ${deleted} old chat messages`);
    }
    return deleted;
  }

  private toPayload(row: ChatMessage): ChatMessagePayload {
    return {
      id: row.id,
      userId: row.userId,
      username: row.username,
      avatarStyle: row.avatarStyle,
      prestigeCount: row.prestigeCount,
      body: row.body,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
    };
  }
}
