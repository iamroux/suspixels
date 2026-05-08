import { Module } from '@nestjs/common';
import { PixelsService } from './pixels.service';
import { PixelsController } from './pixels.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pixel } from './entities/pixel.entity';
import { WebsocketGateway } from './pixels.gateway';
import { AuthModule } from '../auth/auth.module';

// RedisModule is @Global() — REDIS_CLIENT is available without explicit import.
// EventEmitterModule is registered in AppModule — EventEmitter2 is globally injectable.

@Module({
  imports: [
    TypeOrmModule.forFeature([Pixel]),
    AuthModule, // provides JwtAuthGuard + JwtService (needed by WebsocketGateway)
  ],
  controllers: [PixelsController],
  providers: [PixelsService, WebsocketGateway],
})
export class PixelsModule {}
