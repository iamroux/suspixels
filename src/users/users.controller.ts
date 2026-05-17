import { Controller, Get, UseGuards, Req, Patch, Body, NotFoundException, Param } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

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
    // Re-issue a fresh token so cookie-only sessions (e.g. an old visit that
    // predated localStorage persistence, or Safari that cleared site data)
    // can hydrate localStorage. The WS gateway uses this token in identify
    // when the cookie isn't sent on the cross-origin handshake; without it
    // the socket falls into the guest path and the same user shows up twice
    // in the online list.
    const access_token = this.jwtService.sign({
      email: user.email,
      sub: user.id,
      name: user.name,
    });
    return {
      ...result,
      avatarStyle: user.avatarStyle,
      pixelCount,
      rank,
      mostUsedColor,
      access_token,
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
