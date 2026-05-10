import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PixelsService } from './pixels.service';
import { Pixel } from './entities/pixel.entity';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { EventEmitter2 } from '@nestjs/event-emitter';

const mockRepository = {
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockRedis = {
  exists: jest.fn().mockResolvedValue(0),
  hgetall: jest.fn().mockResolvedValue({}),
  hset: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  hdel: jest.fn().mockResolvedValue(1),
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  mget: jest.fn().mockResolvedValue([]),
  scan: jest.fn().mockResolvedValue(['0', []]),
};

const mockEventEmitter = { emit: jest.fn() };

describe('PixelsService', () => {
  let service: PixelsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PixelsService,
        { provide: getRepositoryToken(Pixel), useValue: mockRepository },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<PixelsService>(PixelsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSnapshot', () => {
    beforeAll(() => jest.setTimeout(30_000));
    it('returns a Buffer PNG', async () => {
      mockRedis.hgetall.mockResolvedValue({ '0,0': '#FF0000', '1,1': '#00FF00' });
      const buf = await service.getSnapshot();
      expect(Buffer.isBuffer(buf)).toBe(true);
      // PNG magic bytes: 89 50 4E 47
      expect(buf[0]).toBe(0x89);
      expect(buf[1]).toBe(0x50);
    });

    it('returns cached buffer on second call within TTL', async () => {
      mockRedis.hgetall.mockResolvedValue({ '5,5': '#0000FF' });
      const first = await service.getSnapshot();
      const second = await service.getSnapshot();
      expect(first).toBe(second); // same reference = cached
      expect(mockRedis.hgetall).toHaveBeenCalledTimes(1);
    });

    it('rebuilds snapshot after TTL expires', async () => {
      mockRedis.hgetall.mockResolvedValue({});
      await service.getSnapshot();
      // Force TTL expiry
      (service as any).snapshotCache.builtAt = Date.now() - 61_000;
      await service.getSnapshot();
      expect(mockRedis.hgetall).toHaveBeenCalledTimes(2);
    });

    it('invalidates cache when setPixel is called', async () => {
      mockRedis.hgetall.mockResolvedValue({});
      mockRedis.exists.mockResolvedValue(1);
      await service.getSnapshot();
      expect((service as any).snapshotCache).not.toBeNull();
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.hset.mockResolvedValue(1);
      await service.setPixel({ x: 10, y: 10, color: '#AABBCC', userId: 'u1', userName: 'test' });
      expect((service as any).snapshotCache).toBeNull();
    });
  });
});
