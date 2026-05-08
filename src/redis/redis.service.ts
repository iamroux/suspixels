import { Injectable, Logger, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis) {}

  async testFunction() {
    const response = await this.redisClient.ping();
    this.logger.log(`Redis ping response: ${response}`);
    return { message: 'Redis connection is working', response };
  }

  async getMetrics() {
    const bufferKeys = await this.scanKeys('pixel_buffer:*');
    const cacheSize = await this.redisClient.hlen('pixel_grid');
    return {
      pendingPixels: bufferKeys.length,
      cachedPixels: cacheSize,
      lastProcessed: new Date().toISOString(),
    };
  }

  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await this.redisClient.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');
    return keys;
  }
}
