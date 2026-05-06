import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('pixels')
@Index(['x', 'y'], { unique: true })
export class Pixel {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  x: number;

  @Column()
  y: number;

  @Column({ length: 7 })
  color: string;

  @Column({ name: 'updated_by', nullable: true })
  updatedById: string;

  @ManyToOne(() => User, (user) => user.pixels, { nullable: true })
  @JoinColumn({ name: 'updated_by' })
  updatedBy: User;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
