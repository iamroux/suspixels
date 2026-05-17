import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pixel } from './entities/pixel.entity';
import { CreatePixelDto } from './dto/create-pixel.dto';
import { PixelResponseDto } from './dto/pixel-response.dto';
import { DeletePixelDto } from './dto/delete-pixel.dto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PNG } from 'pngjs';

interface PendingPixel {
  x: number;
  y: number;
  color: string;
  updatedById?: string;
  timestamp: number;
}

export type CompactPixel = [number, number, string];

@Injectable()
export class PixelsService {
  private readonly logger = new Logger(PixelsService.name);
  private readonly PIXEL_BUFFER_KEY = 'pixel_buffer';
  private readonly PIXEL_GRID_KEY = 'pixel_grid';
  private readonly LEADERBOARD_KEY = 'leaderboard';
  private readonly BATCH_SIZE = 100;
  private readonly BUFFER_TTL = 300;
  private readonly LEADERBOARD_TTL = 3600;
  private readonly GRID_SIZE = 3000;
  private readonly SNAPSHOT_TTL_MS = 60_000;

  // In-process pixel map — built from DB at startup, kept current on every write.
  // Eliminates hgetall on every request (hgetall was timing out for large grids).
  private pixelMap: Record<string, string> = {};

  private snapshotCache: { buffer: Buffer; builtAt: number } | null = null;

  // Prevent overlapping cron runs
  private isProcessingPixels = false;

  constructor(
    @InjectRepository(Pixel)
    private readonly pixelRepository: Repository<Pixel>,
    private readonly eventEmitter: EventEmitter2,
    @Inject(REDIS_CLIENT)
    private readonly redisClient: Redis,
  ) {}

  async onModuleInit() {
    await this.initializePixelCache();
  }

  private async initializePixelCache() {
    // Load authoritative data from DB into in-process map
    const pixels = await this.pixelRepository.find({ select: ['x', 'y', 'color'] });
    this.pixelMap = {};
    pixels.forEach((p) => { this.pixelMap[`${p.x},${p.y}`] = p.color; });
    this.logger.log(`Loaded ${pixels.length} pixels into in-process map`);

    // Sync to Redis pixel_grid in background — non-blocking, non-critical
    const snapshot = { ...this.pixelMap };
    this.redisClient.del(this.PIXEL_GRID_KEY)
      .then(() => Object.keys(snapshot).length > 0
        ? this.redisClient.hset(this.PIXEL_GRID_KEY, snapshot)
        : null)
      .catch((e) => this.logger.warn(`Redis pixel_grid sync failed (non-critical): ${e.message}`));
  }

  // Served directly from in-process map — no Redis read
  async getAllPixels(): Promise<PixelResponseDto[]> {
    return Object.entries(this.pixelMap).map(([key, color]) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y, color };
    });
  }

  // Served directly from in-process map — no Redis read
  async getAllPixelsCompact(): Promise<CompactPixel[]> {
    return Object.entries(this.pixelMap).map(([key, color]) => {
      const [x, y] = key.split(',').map(Number);
      return [x, y, color] as CompactPixel;
    });
  }

  async setPixel(
    createPixelDto: CreatePixelDto & { userId?: string; userName?: string },
  ): Promise<PixelResponseDto> {
    this.snapshotCache = null;
    const { x, y, color, userId, userName } = createPixelDto;

    // Update in-process map immediately so next read is correct
    this.pixelMap[`${x},${y}`] = color;

    // Write to Redis buffer (cron flushes to DB every 30s)
    const pendingPixel: PendingPixel = { x, y, color, updatedById: userId, timestamp: Date.now() };
    await this.redisClient.setex(
      `${this.PIXEL_BUFFER_KEY}:${x},${y}`,
      this.BUFFER_TTL,
      JSON.stringify(pendingPixel),
    );

    // Update pixel_grid in Redis best-effort (non-blocking)
    this.redisClient.hset(this.PIXEL_GRID_KEY, `${x},${y}`, color).catch(() => {});

    const responseDto: PixelResponseDto = { x, y, color, insertedBy: userName, userId, updatedAt: new Date() };
    this.eventEmitter.emit('pixel.updated', responseDto);
    return responseDto;
  }

  async getPixelMetadata(x: number, y: number): Promise<PixelResponseDto | null> {
    const pixel = await this.pixelRepository.findOne({ where: { x, y }, relations: ['updatedBy'] });
    return pixel ? this.toResponseDto(pixel) : null;
  }

  async deletePixel(deletePixelDto: DeletePixelDto): Promise<{ x: number; y: number }> {
    this.snapshotCache = null;
    const { x, y } = deletePixelDto;

    // Remove from in-process map immediately
    delete this.pixelMap[`${x},${y}`];

    // Remove pending buffer entry so cron doesn't re-insert it
    await this.redisClient.del(`${this.PIXEL_BUFFER_KEY}:${x},${y}`).catch(() => {});

    // Update pixel_grid in Redis best-effort
    this.redisClient.hdel(this.PIXEL_GRID_KEY, `${x},${y}`).catch(() => {});

    // Authoritative DB delete
    await this.pixelRepository
      .createQueryBuilder()
      .delete()
      .from(Pixel)
      .where('x = :x AND y = :y', { x, y })
      .returning(['x', 'y'])
      .execute();

    this.eventEmitter.emit('pixel.deleted', { x, y });
    return { x, y };
  }

  async getSnapshot(): Promise<Buffer> {
    const now = Date.now();
    if (this.snapshotCache && now - this.snapshotCache.builtAt < this.SNAPSHOT_TTL_MS) {
      return this.snapshotCache.buffer;
    }

    // Use in-process map — no Redis read needed
    const pixelMap = this.pixelMap;

    const png = new PNG({ width: this.GRID_SIZE, height: this.GRID_SIZE, filterType: 0, deflateLevel: 1 });
    png.data.fill(255);

    for (const [key, hex] of Object.entries(pixelMap)) {
      const [x, y] = key.split(',').map(Number);
      if (x < 0 || x >= this.GRID_SIZE || y < 0 || y >= this.GRID_SIZE) continue;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const idx = (y * this.GRID_SIZE + x) * 4;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
    }

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      png.pack()
        .on('data', (chunk: Buffer) => chunks.push(chunk))
        .on('end', () => resolve(Buffer.concat(chunks)))
        .on('error', reject);
    });

    this.snapshotCache = { buffer, builtAt: now };
    return buffer;
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

  async getLeaderboard(): Promise<{ name: string; pixelCount: number }[]> {
    const cached = await this.redisClient.get(this.LEADERBOARD_KEY);
    if (cached) return JSON.parse(cached);

    const result = await this.pixelRepository
      .createQueryBuilder('pixel')
      .innerJoin('pixel.updatedBy', 'user')
      .select('user.name', 'name')
      .addSelect('user.avatarStyle', 'avatarStyle')
      .addSelect('COUNT(*)', 'pixelCount')
      .groupBy('user.name')
      .addGroupBy('user.avatarStyle')
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
