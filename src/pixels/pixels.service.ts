import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pixel } from './entities/pixel.entity';
import { CreatePixelDto } from './dto/create-pixel.dto';
import { PixelResponseDto } from './dto/pixel-response.dto';
import { DeletePixelDto } from './dto/delete-pixel.dto';
import { GetPixelsQueryDto } from './dto/get-pixels-query.dto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
  private readonly LEADERBOARD_KEY = 'leaderboard';
  private readonly BATCH_SIZE = 100;
  private readonly BUFFER_TTL = 300;       // 5 min
  private readonly PIXEL_GRID_TTL = 3600;  // 1 hour
  private readonly LEADERBOARD_TTL = 30;   // 30 seconds

  // Prevent cache stampede on concurrent DB fallback
  private dbLoadPromise: Promise<PixelResponseDto[]> | null = null;

  // Prevent overlapping cron runs
  private isProcessingPixels = false;

  constructor(
    @InjectRepository(Pixel)
    private readonly pixelRepository: Repository<Pixel>,
    // Fix 17: EventEmitter decouples service from gateway (removes forwardRef)
    private readonly eventEmitter: EventEmitter2,
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
      pixels.forEach((p) => { pixelMap[`${p.x},${p.y}`] = p.color; });
      if (Object.keys(pixelMap).length > 0) {
        await this.redisClient.hset(this.PIXEL_GRID_KEY, pixelMap);
      }
      await this.redisClient.expire(this.PIXEL_GRID_KEY, this.PIXEL_GRID_TTL);
    }
  }

  // Fix 14: optional viewport filtering — only send pixels in view
  async getAllPixels(query?: GetPixelsQueryDto): Promise<PixelResponseDto[]> {
    const hasViewport =
      query?.x !== undefined &&
      query?.y !== undefined &&
      query?.w !== undefined &&
      query?.h !== undefined;

    try {
      const cachedPixels = await this.redisClient.hgetall(this.PIXEL_GRID_KEY);
      if (Object.keys(cachedPixels).length > 0) {
        const entries = Object.entries(cachedPixels);
        const filtered = hasViewport
          ? entries.filter(([key]) => {
              const [px, py] = key.split(',').map(Number);
              return (
                px >= query.x! &&
                px < query.x! + query.w! &&
                py >= query.y! &&
                py < query.y! + query.h!
              );
            })
          : entries;
        return filtered.map(([key, color]) => {
          const [x, y] = key.split(',').map(Number);
          return { x, y, color };
        });
      }
    } catch (error) {
      this.logger.warn('Redis unavailable, falling back to database', error);
    }

    // Viewport query: go straight to DB with a range WHERE clause
    if (hasViewport) {
      const pixels = await this.pixelRepository
        .createQueryBuilder('pixel')
        .where(
          'pixel.x >= :x AND pixel.x < :x2 AND pixel.y >= :y AND pixel.y < :y2',
          {
            x: query!.x,
            x2: query!.x! + query!.w!,
            y: query!.y,
            y2: query!.y! + query!.h!,
          },
        )
        .getMany();
      return pixels.map(this.toResponseDto);
    }

    // Full load: coalesce concurrent misses into one DB query
    if (this.dbLoadPromise) return this.dbLoadPromise;
    this.dbLoadPromise = this.loadPixelsFromDb().finally(() => {
      this.dbLoadPromise = null;
    });
    return this.dbLoadPromise;
  }

  private async loadPixelsFromDb(): Promise<PixelResponseDto[]> {
    const pixels = await this.pixelRepository.find({ order: { updatedAt: 'DESC' } });
    this.updatePixelCache(pixels).catch(() => {
      this.logger.error('Failed to update pixel cache after DB fallback');
    });
    return pixels.map(this.toResponseDto);
  }

  async setPixel(
    createPixelDto: CreatePixelDto & { userId?: string; userName?: string },
  ): Promise<PixelResponseDto> {
    const { x, y, color, userId, userName } = createPixelDto;

    const pendingPixel: PendingPixel = { x, y, color, updatedById: userId, timestamp: Date.now() };
    await this.redisClient.setex(
      `${this.PIXEL_BUFFER_KEY}:${x},${y}`,
      this.BUFFER_TTL,
      JSON.stringify(pendingPixel),
    );

    await this.redisClient.hset(this.PIXEL_GRID_KEY, `${x},${y}`, color);
    await this.redisClient.expire(this.PIXEL_GRID_KEY, this.PIXEL_GRID_TTL);

    const responseDto: PixelResponseDto = { x, y, color, insertedBy: userName, userId, updatedAt: new Date() };

    // Fix 17: emit event instead of calling gateway directly
    this.eventEmitter.emit('pixel.updated', responseDto);

    return responseDto;
  }

  async getPixelMetadata(x: number, y: number): Promise<PixelResponseDto | null> {
    const pixel = await this.pixelRepository.findOne({ where: { x, y }, relations: ['updatedBy'] });
    return pixel ? this.toResponseDto(pixel) : null;
  }

  async deletePixel(deletePixelDto: DeletePixelDto): Promise<{ x: number; y: number }> {
    const { x, y } = deletePixelDto;

    await this.redisClient.del(`${this.PIXEL_BUFFER_KEY}:${x},${y}`);
    await this.redisClient.hdel(this.PIXEL_GRID_KEY, `${x},${y}`);
    await this.pixelRepository
      .createQueryBuilder()
      .delete()
      .from(Pixel)
      .where('x = :x AND y = :y', { x, y })
      .returning(['x', 'y'])
      .execute();

    // Fix 17: emit event instead of calling gateway directly
    this.eventEmitter.emit('pixel.deleted', { x, y });

    return { x, y };
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processPendingPixels() {
    if (this.isProcessingPixels) {
      this.logger.warn('Pixel flush already in progress — skipping this tick');
      return;
    }
    this.isProcessingPixels = true;
    try {
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
    const rawValues = await this.redisClient.mget(keys);
    const pixels: PendingPixel[] = rawValues
      .filter((v): v is string => v !== null)
      .map((v) => JSON.parse(v));
    if (pixels.length === 0) return;

    try {
      await this.pixelRepository
        .createQueryBuilder()
        .insert()
        .into(Pixel)
        .values(pixels.map((p) => ({ x: p.x, y: p.y, color: p.color, updatedById: p.updatedById })))
        .orUpdate(['color', 'updated_by', 'updated_at'], ['x', 'y'])
        .execute();
      await this.redisClient.del(keys);
    } catch (error) {
      this.logger.error('Error inserting pixels into database', error);
    }
  }

  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await this.redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');
    return keys;
  }

  private async updatePixelCache(pixels: Pixel[]) {
    const pixelMap: Record<string, string> = {};
    pixels.forEach((p) => { pixelMap[`${p.x},${p.y}`] = p.color; });
    if (Object.keys(pixelMap).length > 0) {
      await this.redisClient.hset(this.PIXEL_GRID_KEY, pixelMap);
    }
    await this.redisClient.expire(this.PIXEL_GRID_KEY, this.PIXEL_GRID_TTL);
  }

  // Fix 15: cache leaderboard in Redis to avoid repeated GROUP BY query
  async getLeaderboard(): Promise<{ name: string; pixelCount: number }[]> {
    const cached = await this.redisClient.get(this.LEADERBOARD_KEY);
    if (cached) return JSON.parse(cached);

    const result = await this.pixelRepository
      .createQueryBuilder('pixel')
      .innerJoin('pixel.updatedBy', 'user')
      .select('user.name', 'name')
      .addSelect('COUNT(*)', 'pixelCount')
      .groupBy('user.name')
      .orderBy('COUNT(*)', 'DESC')
      .limit(10)
      .getRawMany();

    await this.redisClient.setex(this.LEADERBOARD_KEY, this.LEADERBOARD_TTL, JSON.stringify(result));
    return result;
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
