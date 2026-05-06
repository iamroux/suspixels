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
    
    const { password, ...result } = user;
    return {
      ...result,
      pixelCount,
    };
  }

  @Patch('me')
  async updateProfile(@Req() req: any, @Body() updateData: any) {
    return this.usersService.update(req.user.userId, updateData);
  }
}
