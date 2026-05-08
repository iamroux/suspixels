import { Module, forwardRef } from '@nestjs/common';
import { PixelsService } from './pixels.service';
import { PixelsController } from './pixels.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pixel } from './entities/pixel.entity';
import { WebsocketGateway } from './pixels.gateway';
import { AuthModule } from '../auth/auth.module';

// RedisModule is @Global() so REDIS_CLIENT is available without explicit import here

@Module({
  imports: [
    TypeOrmModule.forFeature([Pixel]),
    forwardRef(() => AuthModule),
  ],
  controllers: [PixelsController],
  providers: [PixelsService, WebsocketGateway],
})
export class PixelsModule {}
