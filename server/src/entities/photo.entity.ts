import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Photos are keyed by student number, so every exam containing the student reuses them. */
@Entity('photos')
export class Photo {
  @PrimaryColumn()
  studentNo: string;

  /** Cache-busting token appended to photo URLs; lets the browser cache them as immutable. */
  @Column()
  version: string;

  @Column({ default: '' })
  originalName: string;

  @Column({ default: 0 })
  originalSize: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
