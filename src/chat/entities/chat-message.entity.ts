import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('chat_messages')
@Index(['createdAt'])
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ length: 40 })
  username: string;

  @Column({ name: 'avatar_style', length: 20 })
  avatarStyle: string;

  @Column({ name: 'prestige_count', type: 'int', default: 0 })
  prestigeCount: number;

  @Column({ length: 500 })
  body: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
