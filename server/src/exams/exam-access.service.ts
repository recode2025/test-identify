import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Exam, User } from '../entities';

@Injectable()
export class ExamAccessService {
  constructor(private readonly ds: DataSource) {}

  /** Admins see every exam; staff only see active exams assigned to them. */
  async accessibleExamIds(user: User): Promise<number[] | 'all'> {
    if (user.role === 'admin') return 'all';
    const rows: { examsId: number }[] = await this.ds.query(
      `SELECT ue.examsId FROM user_exams ue JOIN exams e ON e.id = ue.examsId WHERE ue.usersId = ? AND e.active = 1`,
      [user.id],
    );
    return rows.map((r) => r.examsId);
  }

  async canAccess(user: User, examId: number) {
    const ids = await this.accessibleExamIds(user);
    return ids === 'all' || ids.includes(examId);
  }

  async assert(user: User, examId: number): Promise<Exam> {
    const exam = await this.ds.getRepository(Exam).findOne({ where: { id: examId } });
    if (!exam) throw new NotFoundException('考试不存在');
    if (!(await this.canAccess(user, examId))) throw new ForbiddenException('该账号未分配此考试');
    return exam;
  }
}
