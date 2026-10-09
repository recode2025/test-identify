import { Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Exam } from './exam.entity';
import { User } from './user.entity';

/** One seat row of one room, handed to one staff member. `room` is '' when the roster has no 考场 column. */
@Entity('row_assignments')
@Index(['examId', 'room', 'row'], { unique: true })
export class RowAssignment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  examId: number;

  @ManyToOne(() => Exam, { onDelete: 'CASCADE' })
  exam: Exam;

  @Column({ default: '' })
  room: string;

  @Column({ type: 'integer' })
  row: number;

  @Column()
  @Index()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;
}
