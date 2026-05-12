import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Pixel } from '../pixels/entities/pixel.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Pixel)
    private readonly pixelRepository: Repository<Pixel>,
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

  async findByName(name: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { name } });
  }

  async getPixelCount(userId: string): Promise<number> {
    return this.pixelRepository.count({ where: { updatedById: userId } });
  }

  async getRank(userId: string): Promise<number> {
    const userPixelCount = await this.getPixelCount(userId);
    const queryBuilder = this.pixelRepository.createQueryBuilder('pixel');
    
    const countAbove = await queryBuilder
      .select('updated_by')
      .where('pixel.updatedById IS NOT NULL') // Exclude anonymous pixels
      .groupBy('updated_by')
      .having('COUNT(id) > :count', { count: userPixelCount })
      .getRawMany();
      
    return countAbove.length + 1;
  }

  async getMostUsedColor(userId: string): Promise<{ color: string, count: number } | null> {
    const result = await this.pixelRepository
      .createQueryBuilder('pixel')
      .select('pixel.color', 'color')
      .addSelect('COUNT(pixel.id)', 'count')
      .where('pixel.updatedById = :userId', { userId })
      .groupBy('pixel.color')
      .orderBy('count', 'DESC')
      .limit(1)
      .getRawOne();
      
    return result ? { color: result.color, count: parseInt(result.count) } : null;
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
