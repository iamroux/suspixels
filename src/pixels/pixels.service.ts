import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pixel } from './entities/pixel.entity';
import { CreatePixelDto } from './dto/create-pixel.dto';
import { PixelResponseDto } from './dto/pixel-response.dto';
import { DeletePixelDto } from './dto/delete-pixel.dto';
import { WebsocketGateway } from './pixels.gateway';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
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
  private readonly redisClient: Redis;
  private readonly PIXEL_BUFFER_KEY = 'pixel_buffer';
  private readonly PIXEL_GRID_KEY = 'pixel_grid';
  private readonly BATCH_SIZE = 100;
  private readonly BUFFER_TTL = 300; // 5 minutes

  constructor(
    @InjectRepository(Pixel)
    private readonly pixelRepository: Repository<Pixel>,
    @Inject(forwardRef(() => WebsocketGateway))
    private readonly websocketGateway: WebsocketGateway,
    private readonly configService: ConfigService,
  ) {
    const redisUrl = this.configService.get<string>('redis.url');
    const options = {
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      commandTimeout: 5000,
      lazyConnect: true,
    };
    
    if (redisUrl) {
      this.redisClient = new Redis(redisUrl, options);
    } else {
      this.redisClient = new Redis({
        ...options,
        host: this.configService.get<string>('redis.host') || 'localhost',
        port: this.configService.get<number>('redis.port') || 6379,
      });
    }
  }

  async onModuleInit() {
    await this.initializePixelCache();
  }

  private async initializePixelCache() {
    const exists = await this.redisClient.exists(this.PIXEL_GRID_KEY);
    if (!exists) {
      const pixels = await this.pixelRepository.find();
      const pixelMap = {};

      pixels.forEach((pixel) => {
        pixelMap[`${pixel.x},${pixel.y}`] = pixel.color;
      });

      if (Object.keys(pixelMap).length > 0) {
        await this.redisClient.hset(this.PIXEL_GRID_KEY, pixelMap);
      }
      await this.redisClient.expire(this.PIXEL_GRID_KEY, 36000); // 1 hour
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
      this.logger.warn('Cache miss, falling back to database', error);
    }

    const pixels = await this.pixelRepository.find({
      order: { updatedAt: 'DESC' },
    });

    // update cache asynchronously
    this.updatePixelCache(pixels).catch(() => {
      this.logger.error('Failed to update pixel cache');
    });

    return pixels.map(this.toResponseDto);
  }

  async setPixel(createPixelDto: CreatePixelDto & { userId?: string, userName?: string }): Promise<PixelResponseDto> {
    const { x, y, color, userId, userName } = createPixelDto;

    const pendingPixel: PendingPixel = {
      x,
      y,
      color,
      updatedById: userId,
      timestamp: Date.now(),
    };

    const bufferKey = `${this.PIXEL_BUFFER_KEY}:${x},${y}`;
    await this.redisClient.setex(
      bufferKey,
      this.BUFFER_TTL,
      JSON.stringify(pendingPixel),
    );

    const pixelKey = `${x},${y}`;
    await this.redisClient.hset(this.PIXEL_GRID_KEY, pixelKey, color);

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
      relations: ['updatedBy']
    });
    return pixel ? this.toResponseDto(pixel) : null;
  }

  async deletePixel(
    deletePixelDto: DeletePixelDto,
  ): Promise<{ x: number; y: number }> {
    const { x, y } = deletePixelDto;

    const bufferKey = `${this.PIXEL_BUFFER_KEY}:${x},${y}`;
    await this.redisClient.del(bufferKey);

    const pixelKey = `${x},${y}`;
    await this.redisClient.hdel(this.PIXEL_GRID_KEY, pixelKey);

    const result = await this.pixelRepository
      .createQueryBuilder()
      .delete()
      .from(Pixel)
      .where('x = :x AND y = :y', { x, y })
      .returning(['x', 'y'])
      .execute();

    // Even if no pixel was found in database, we still broadcast the delete
    // to ensure all clients are in sync (in case pixel only existed in cache)
    this.websocketGateway.broadcastPixelDelete(x, y);

    // Return the coordinates regardless of whether pixel existed
    return { x, y };
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processPendingPixels() {
    try {
      const bufferPattern = `${this.PIXEL_BUFFER_KEY}:*`;
      const keys = await this.redisClient.keys(bufferPattern);
      if (keys.length === 0) {
        return;
      }

      const batches: string[][] = [];
      for (let i = 0; i < keys.length; i += this.BATCH_SIZE) {
        batches.push(keys.slice(i, i + this.BATCH_SIZE));
      }

      for (const batch of batches) {
        await this.processBatch(batch);
      }
    } catch (error) {
      this.logger.error('Error processing pending pixels', error);
    }
  }

  private async processBatch(keys: string[]) {
    const pixels: PendingPixel[] = [];

    for (const key of keys) {
      const pixelData = await this.redisClient.get(key);
      if (pixelData) {
        pixels.push(JSON.parse(pixelData));
      }
    }

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

  private async updatePixelCache(pixels: Pixel[]) {
    const pixelMap = {};

    pixels.forEach((pixel) => {
      pixelMap[`${pixel.x},${pixel.y}`] = pixel.color;
    });

    if (Object.keys(pixelMap).length > 0) {
      await this.redisClient.hset(this.PIXEL_GRID_KEY, pixelMap);
    }
    await this.redisClient.expire(this.PIXEL_GRID_KEY, 3600);
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
