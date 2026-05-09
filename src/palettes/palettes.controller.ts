import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { PalettesService } from './palettes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/palettes')
@UseGuards(JwtAuthGuard)
export class PalettesController {
  constructor(private readonly palettesService: PalettesService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.palettesService.findAll(req.user.userId);
  }

  @Post()
  create(@Req() req: any, @Body() createPaletteDto: { name: string; colors: string[] }) {
    return this.palettesService.create(req.user.userId, createPaletteDto);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() updateData: { name?: string; colors?: string[] }) {
    return this.palettesService.update(req.user.userId, id, updateData);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.palettesService.remove(req.user.userId, id);
  }
}
