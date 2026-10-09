import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type SenderRole = 'admin' | 'staff' | 'system';

/** One conversation per staff account; every admin shares the admin side of it. */
@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  staffId: number;

  @Column({ type: 'integer', nullable: true })
  senderId: number | null;

  @Column()
  senderName: string;

  @Column({ type: 'varchar' })
  senderRole: SenderRole;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'integer', nullable: true })
  candidateId: number | null;

  @Column({ type: 'varchar', nullable: true })
  candidateLabel: string | null;

  @Column({ default: false })
  readByAdmin: boolean;

  @Column({ default: false })
  readByStaff: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
