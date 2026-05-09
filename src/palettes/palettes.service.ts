import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Palette } from './entities/palette.entity';

@Injectable()
export class PalettesService {
  constructor(
    @InjectRepository(Palette)
    private palettesRepository: Repository<Palette>,
  ) {}

  async findAll(userId: string): Promise<Palette[]> {
    return this.palettesRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
  }

  async create(userId: string, createPaletteDto: { name: string; colors: string[] }): Promise<Palette> {
    const count = await this.palettesRepository.count({ where: { userId } });
    if (count >= 3) {
      throw new BadRequestException('You can only have up to 3 palettes.');
    }

    const palette = this.palettesRepository.create({
      ...createPaletteDto,
      userId,
    });
    return this.palettesRepository.save(palette);
  }

  async update(userId: string, id: string, updateData: { name?: string; colors?: string[] }): Promise<Palette> {
    const palette = await this.palettesRepository.findOne({ where: { id, userId } });
    if (!palette) {
      throw new NotFoundException('Palette not found');
    }

    if (updateData.name !== undefined) palette.name = updateData.name;
    if (updateData.colors !== undefined) palette.colors = updateData.colors;

    return this.palettesRepository.save(palette);
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.palettesRepository.delete({ id, userId });
    if (result.affected === 0) {
      throw new NotFoundException('Palette not found');
    }
  }
}
