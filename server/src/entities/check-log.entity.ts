import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Append-only audit trail of every check / reset / handle action. */
@Entity('check_logs')
export class CheckLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  examId: number;

  @Column()
  @Index()
  candidateId: number;

  @Column()
  action: string;

  @Column({ type: 'varchar', nullable: true })
  issueType: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column()
  userId: number;

  @Column()
  userName: string;

  @CreateDateColumn()
  createdAt: Date;
}
