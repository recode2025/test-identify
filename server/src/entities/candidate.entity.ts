import { Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Exam } from './exam.entity';

export type CheckStatus = 'pending' | 'normal' | 'issue';
export type IssueType = 'cheat' | 'substitute' | 'other';

@Entity('candidates')
@Index(['examId', 'studentNo'], { unique: true })
export class Candidate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  examId: number;

  @ManyToOne(() => Exam, { onDelete: 'CASCADE' })
  exam: Exam;

  @Column({ type: 'integer', nullable: true })
  seq: number | null;

  @Column()
  @Index()
  studentNo: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  seatNo: string | null;

  @Column({ type: 'varchar', default: 'pending' })
  status: CheckStatus;

  @Column({ type: 'varchar', nullable: true })
  issueType: IssueType | null;

  @Column({ type: 'text', nullable: true })
  issueNote: string | null;

  @Column({ type: 'integer', nullable: true })
  checkedById: number | null;

  @Column({ type: 'varchar', nullable: true })
  checkedByName: string | null;

  @Column({ type: 'datetime', nullable: true })
  checkedAt: Date | null;

  @Column({ default: false })
  handled: boolean;

  @Column({ type: 'text', nullable: true })
  handleNote: string | null;

  @Column({ type: 'varchar', nullable: true })
  handledByName: string | null;

  @Column({ type: 'datetime', nullable: true })
  handledAt: Date | null;
}
