import { Injectable, ConflictException, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Pixel } from '../pixels/entities/pixel.entity';
import * as bcrypt from 'bcrypt';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';

@Injectable()
export class UsersService {
  private readonly PIXEL_COUNT_TTL = 60;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Pixel)
    private readonly pixelRepository: Repository<Pixel>,
    @Inject(REDIS_CLIENT)
    private readonly redisClient: Redis,
  ) {}

  async create(userData: Partial<User>): Promise<User> {
    const { email, password, name } = userData;
    
    if (!email || !password || !name) {
      throw new Error('Email, password, and name are required');
    }

    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(password as string, 10);
    const user = this.userRepository.create({
      email,
      name,
      password: hashedPassword,
    });

    return this.userRepository.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async getPixelCount(userId: string): Promise<number> {
    const key = `user_pixel_count:${userId}`;
    const cached = await this.redisClient.get(key);
    if (cached !== null) return parseInt(cached, 10);

    const count = await this.pixelRepository.count({ where: { updatedById: userId } });
    await this.redisClient.setex(key, this.PIXEL_COUNT_TTL, count.toString());
    return count;
  }

  async update(userId: string, updateData: any): Promise<User> {
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }
    await this.userRepository.update(userId, updateData);
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
