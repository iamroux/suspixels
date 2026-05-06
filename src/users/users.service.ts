import { Injectable, ConflictException } from '@nestjs/common';
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

  async getPixelCount(userId: string): Promise<number> {
    return this.pixelRepository.count({ where: { updatedById: userId } });
  }

  async update(userId: string, updateData: any): Promise<User> {
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }
    await this.userRepository.update(userId, updateData);
    return this.findById(userId);
  }
}
