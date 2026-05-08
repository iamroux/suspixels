import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pixel } from './entities/pixel.entity';
import { CreatePixelDto } from './dto/create-pixel.dto';
import { PixelResponseDto } from './dto/pixel-response.dto';
import { DeletePixelDto } from './dto/delete-pixel.dto';
import { WebsocketGateway } from './pixels.gateway';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { Cron, CronExpression } from '@nestjs/schedule';

interface PendingPixel {
  x: number;
  y: number;
  color: string;
  updatedById?: string;
  timestamp: number;
}

@Injectable()
export class PixelsService {
  private readonly logger = new Logger(PixelsService.name);
  private readonly PIXEL_BUFFER_KEY = 'pixel_buffer';
  private readonly PIXEL_GRID_KEY = 'pixel_grid';
  private readonly BATCH_SIZE = 100;
  private readonly BUFFER_TTL = 300; // 5 minutes
  private readonly PIXEL_GRID_TTL = 3600; // 1 hour — used consistently everywhere

  // Bug fix: coalesce concurrent cache misses into one DB query
  private dbLoadPromise: Promise<PixelResponseDto[]> | null = null;

  // Bug fix: prevent overlapping cron runs
  private isProcessingPixels = false;

  constructor(
    @InjectRepository(Pixel)
    private readonly pixelRepository: Repository<Pixel>,
    @Inject(forwardRef(() => WebsocketGateway))
    private readonly websocketGateway: WebsocketGateway,
    // Bug fix: inject shared Redis client instead of creating a new one per service
    @Inject(REDIS_CLIENT)
    private readonly redisClient: Redis,
  ) {}

  async onModuleInit() {
    await this.initializePixelCache();
  }

  private async initializePixelCache() {
    const exists = await this.redisClient.exists(this.PIXEL_GRID_KEY);
    if (!exists) {
      const pixels = await this.pixelRepository.find();
      const pixelMap: Record<string, string> = {};

      pixels.forEach((pixel) => {
        pixelMap[`${pixel.x},${pixel.y}`] = pixel.color;
      });

      if (Object.keys(pixelMap).length > 0) {
        await this.redisClient.hset(this.PIXEL_GRID_KEY, pixelMap);
      }
      await this.redisClient.expire(this.PIXEL_GRID_KEY, this.PIXEL_GRID_TTL);
    }
  }

  async getAllPixels(): Promise<PixelResponseDto[]> {
    try {
      const cachedPixels = await this.redisClient.hgetall(this.PIXEL_GRID_KEY);
      if (Object.keys(cachedPixels).length > 0) {
        return Object.entries(cachedPixels).map(([key, color]) => {
          const [x, y] = key.split(',').map(Number);
          return { x, y, color };
        });
      }
    } catch (error) {
      this.logger.warn('Redis unavailable, falling back to database', error);
    }

    // Bug fix: coalesce concurrent cache misses — only one DB query fires at a time
    if (this.dbLoadPromise) {
      return this.dbLoadPromise;
    }

    this.dbLoadPromise = this.loadPixelsFromDb().finally(() => {
      this.dbLoadPromise = null;
    });

    return this.dbLoadPromise;
  }

  private async loadPixelsFromDb(): Promise<PixelResponseDto[]> {
    const pixels = await this.pixelRepository.find({
      order: { updatedAt: 'DESC' },
    });

    this.updatePixelCache(pixels).catch(() => {
      this.logger.error('Failed to update pixel cache after DB fallback');
    });

    return pixels.map(this.toResponseDto);
  }

  async setPixel(createPixelDto: CreatePixelDto & { userId?: string; userName?: string }): Promise<PixelResponseDto> {
    const { x, y, color, userId, userName } = createPixelDto;

    const pendingPixel: PendingPixel = {
      x,
      y,
      color,
      updatedById: userId,
      timestamp: Date.now(),
    };

    const bufferKey = `${this.PIXEL_BUFFER_KEY}:${x},${y}`;
    await this.redisClient.setex(bufferKey, this.BUFFER_TTL, JSON.stringify(pendingPixel));

    const pixelKey = `${x},${y}`;
    await this.redisClient.hset(this.PIXEL_GRID_KEY, pixelKey, color);
    // Refresh TTL on every write to keep the grid cache warm
    await this.redisClient.expire(this.PIXEL_GRID_KEY, this.PIXEL_GRID_TTL);

    const responseDto: PixelResponseDto = {
      x,
      y,
      color,
      insertedBy: userName,
      userId,
      updatedAt: new Date(),
    };

    this.websocketGateway.broadcastPixelUpdate(responseDto);

    return responseDto;
  }

  async getPixelMetadata(x: number, y: number): Promise<PixelResponseDto | null> {
    const pixel = await this.pixelRepository.findOne({
      where: { x, y },
      relations: ['updatedBy'],
    });
    return pixel ? this.toResponseDto(pixel) : null;
  }

  async deletePixel(deletePixelDto: DeletePixelDto): Promise<{ x: number; y: number }> {
    const { x, y } = deletePixelDto;

    const bufferKey = `${this.PIXEL_BUFFER_KEY}:${x},${y}`;
    await this.redisClient.del(bufferKey);

    const pixelKey = `${x},${y}`;
    await this.redisClient.hdel(this.PIXEL_GRID_KEY, pixelKey);

    await this.pixelRepository
      .createQueryBuilder()
      .delete()
      .from(Pixel)
      .where('x = :x AND y = :y', { x, y })
      .returning(['x', 'y'])
      .execute();

    // Broadcast even if pixel wasn't in DB — keeps all clients in sync with cache
    this.websocketGateway.broadcastPixelDelete(x, y);

    return { x, y };
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processPendingPixels() {
    // Bug fix: skip if previous run hasn't finished (prevents double-writes on large backlogs)
    if (this.isProcessingPixels) {
      this.logger.warn('Pixel flush already in progress — skipping this tick');
      return;
    }
    this.isProcessingPixels = true;
    try {
      // Bug fix: SCAN instead of KEYS (non-blocking, safe for large keyspaces)
      const keys = await this.scanKeys(`${this.PIXEL_BUFFER_KEY}:*`);
      if (keys.length === 0) return;

      for (let i = 0; i < keys.length; i += this.BATCH_SIZE) {
        await this.processBatch(keys.slice(i, i + this.BATCH_SIZE));
      }
    } catch (error) {
      this.logger.error('Error processing pending pixels', error);
    } finally {
      this.isProcessingPixels = false;
    }
  }

  private async processBatch(keys: string[]) {
    // Bug fix: MGET fetches all keys in one round-trip instead of N sequential GETs
    const rawValues = await this.redisClient.mget(keys);
    const pixels: PendingPixel[] = rawValues
      .filter((v): v is string => v !== null)
      .map((v) => JSON.parse(v));

    if (pixels.length === 0) return;

    const values = pixels.map((pixel) => ({
      x: pixel.x,
      y: pixel.y,
      color: pixel.color,
      updatedById: pixel.updatedById,
    }));

    try {
      await this.pixelRepository
        .createQueryBuilder()
        .insert()
        .into(Pixel)
        .values(values)
        .orUpdate(['color', 'updated_by', 'updated_at'], ['x', 'y'])
        .execute();

      await this.redisClient.del(keys);
    } catch (error) {
      this.logger.error('Error inserting pixels into database', error);
    }
  }

  // Bug fix: SCAN is non-blocking; KEYS blocks the entire Redis server
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

  private async updatePixelCache(pixels: Pixel[]) {
    const pixelMap: Record<string, string> = {};

    pixels.forEach((pixel) => {
      pixelMap[`${pixel.x},${pixel.y}`] = pixel.color;
    });

    if (Object.keys(pixelMap).length > 0) {
      await this.redisClient.hset(this.PIXEL_GRID_KEY, pixelMap);
    }
    // Bug fix: was 3600 here vs 36000 in initializePixelCache — now consistent via constant
    await this.redisClient.expire(this.PIXEL_GRID_KEY, this.PIXEL_GRID_TTL);
  }

  async getLeaderboard(): Promise<{ name: string; pixelCount: number }[]> {
    return this.pixelRepository
      .createQueryBuilder('pixel')
      .innerJoin('pixel.updatedBy', 'user')
      .select('user.name', 'name')
      .addSelect('COUNT(*)', 'pixelCount')
      .groupBy('user.name')
      .orderBy('COUNT(*)', 'DESC')
      .limit(10)
      .getRawMany();
  }

  private toResponseDto(pixel: Pixel): PixelResponseDto {
    return {
      x: pixel.x,
      y: pixel.y,
      color: pixel.color,
      insertedBy: pixel.updatedBy?.name || 'Anonymous',
      userId: pixel.updatedById,
      updatedAt: pixel.updatedAt,
    };
  }
}
