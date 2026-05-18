import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PixelsModule } from './pixels/pixels.module';
import { DatabaseModule } from './database/database.module';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from './redis/redis.module';
import appConfig from './config/app.config';
import redisConfig from './config/redis.config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PalettesModule } from './palettes/palettes.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    PixelsModule,
    DatabaseModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, redisConfig],
    }),
    RedisModule,
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    PalettesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
