import { Controller, Get, UseGuards, Req, Patch, Body, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getProfile(@Req() req: any) {
    const userId = req.user.userId;
    const user = await this.usersService.findById(userId);
    
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const pixelCount = await this.usersService.getPixelCount(userId);
    const rank = await this.usersService.getRank(userId);
    const mostUsedColor = await this.usersService.getMostUsedColor(userId);
    
    // Calculate days joined
    const now = new Date();
    const joined = new Date(user.createdAt);
    const diffTime = Math.abs(now.getTime() - joined.getTime());
    const daysJoined = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const { password, ...result } = user;
    return {
      ...result,
      pixelCount,
      rank,
      mostUsedColor,
      daysJoined,
    };
  }

  @Patch('me')
  async updateProfile(@Req() req: any, @Body() updateData: any) {
    return this.usersService.update(req.user.userId, updateData);
  }
}
