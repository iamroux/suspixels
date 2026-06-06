import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
