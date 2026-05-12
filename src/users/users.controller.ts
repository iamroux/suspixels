import { Controller, Get, UseGuards, Req, Patch, Body, NotFoundException, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: any) {
    const userId = req.user.userId;
    const user = await this.usersService.findById(userId);
    
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const pixelCount = await this.usersService.getPixelCount(userId);
    const rank = await this.usersService.getRank(userId);
    const mostUsedColor = await this.usersService.getMostUsedColor(userId);
    
    const { password, ...result } = user;
    return {
      ...result,
      avatarStyle: user.avatarStyle,
      pixelCount,
      rank,
      mostUsedColor,
    };
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@Req() req: any, @Body() updateData: any) {
    return this.usersService.update(req.user.userId, updateData);
  }

  @Get('public/:name')
  async getPublicProfile(@Param('name') name: string) {
    const user = await this.usersService.findByName(name);
    if (!user) throw new NotFoundException('User not found');
    const pixelCount = await this.usersService.getPixelCount(user.id);
    const rank = await this.usersService.getRank(user.id);
    const mostUsedColor = await this.usersService.getMostUsedColor(user.id);
    return { name: user.name, avatarStyle: user.avatarStyle, pixelCount, rank, mostUsedColor };
  }
}
