import { Column, CreateDateColumn, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Exam } from './exam.entity';

export type Role = 'admin' | 'staff';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column()
  passwordHash: string;

  @Column({ default: '' })
  displayName: string;

  @Column({ type: 'varchar', default: 'staff' })
  role: Role;

  @Column({ default: true })
  enabled: boolean;

  /** Bumped on password change / disable so existing tokens stop working. */
  @Column({ default: 0 })
  tokenVersion: number;

  @ManyToMany(() => Exam, { cascade: false })
  @JoinTable({ name: 'user_exams' })
  exams: Exam[];

  @CreateDateColumn()
  createdAt: Date;
}
