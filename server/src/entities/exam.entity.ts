import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('exams')
export class Exam {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ default: '' })
  date: string;

  @Column({ default: '' })
  location: string;

  @Column({ default: true })
  active: boolean;

  /** Seats per row, used to derive the row from a plain seat number (01-12 → row 1). 0 = only explicit "3-5" style seats. */
  @Column({ default: 12 })
  seatsPerRow: number;

  @CreateDateColumn()
  createdAt: Date;
}
