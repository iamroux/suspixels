import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PalettesService } from './palettes.service';
import { PalettesController } from './palettes.controller';
import { Palette } from './entities/palette.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Palette])],
  controllers: [PalettesController],
  providers: [PalettesService],
})
export class PalettesModule {}
