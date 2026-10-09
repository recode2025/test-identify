import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Candidate, CheckLog, Exam, IssueType, User } from '../entities';
import { RealtimeGateway, rooms } from '../realtime/realtime.gateway';
import { ExamAccessService } from './exam-access.service';
import { PhotosService } from '../photos/photos.service';
import { ChatService, candidateLabel } from '../chat/chat.service';
import { readWorkbook, SheetRow } from './excel';
import { str } from '../common/http';

export const ISSUE_LABELS: Record<IssueType, string> = { cheat: '作弊', substitute: '替考', other: '其他' };
const STATUS_LABELS = { pending: '未核查', normal: '正常', issue: '异常' };

const collator = new Intl.Collator('zh-CN', { numeric: true });

/** Seat order first (blank seats last), then the sheet's 序号, then student number. */
function compareCandidates(a: Candidate, b: Candidate) {
  if (a.seatNo && b.seatNo) return collator.compare(a.seatNo, b.seatNo) || a.id - b.id;
  if (a.seatNo || b.seatNo) return a.seatNo ? -1 : 1;
  return (a.seq ?? Infinity) - (b.seq ?? Infinity) || collator.compare(a.studentNo, b.studentNo);
}

@Injectable()
export class ExamsService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Exam) private readonly exams: Repository<Exam>,
    @InjectRepository(Candidate) private readonly candidates: Repository<Candidate>,
    @InjectRepository(CheckLog) private readonly logs: Repository<CheckLog>,
    private readonly access: ExamAccessService,
    private readonly photos: PhotosService,
    private readonly chat: ChatService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // ---------- exams ----------

  async list(user: User) {
    const ids = await this.access.accessibleExamIds(user);
    if (ids !== 'all' && !ids.length) return [];
    const exams = await this.exams.find({
      where: ids === 'all' ? {} : { id: In(ids) },
      order: { createdAt: 'DESC' },
    });
    const stats: any[] = await this.ds.query(`
      SELECT c.examId,
             COUNT(*) AS total,
             SUM(c.status = 'normal') AS normal,
             SUM(c.status = 'issue') AS issue,
             SUM(c.status = 'issue' AND c.handled = 0) AS unhandled,
             SUM(p.studentNo IS NOT NULL) AS withPhoto
      FROM candidates c LEFT JOIN photos p ON p.studentNo = c.studentNo
      GROUP BY c.examId`);
    const byExam = new Map(stats.map((s) => [s.examId, s]));
    return exams.map((e) => {
      const s = byExam.get(e.id) ?? {};
      const total = Number(s.total ?? 0);
      const normal = Number(s.normal ?? 0);
      const issue = Number(s.issue ?? 0);
      return {
        ...e,
        stats: {
          total,
          normal,
          issue,
          pending: total - normal - issue,
          unhandled: Number(s.unhandled ?? 0),
          withPhoto: Number(s.withPhoto ?? 0),
        },
      };
    });
  }

  async create(body: any) {
    return this.exams.save(
      this.exams.create({
        name: str(body.name, '考试名称', { required: true, max: 100 }),
        date: str(body.date, '日期', { max: 50 }),
        location: str(body.location, '地点', { max: 100 }),
        active: body.active !== false,
      }),
    );
  }

  async update(id: number, body: any) {
    const exam = await this.getExam(id);
    if (body.name !== undefined) exam.name = str(body.name, '考试名称', { required: true, max: 100 });
    if (body.date !== undefined) exam.date = str(body.date, '日期', { max: 50 });
    if (body.location !== undefined) exam.location = str(body.location, '地点', { max: 100 });
    if (body.active !== undefined) exam.active = !!body.active;
    return this.exams.save(exam);
  }

  async remove(id: number) {
    await this.getExam(id);
    await this.ds.transaction(async (m) => {
      await m.delete(CheckLog, { examId: id });
      await m.delete(Candidate, { examId: id });
      await m.query('DELETE FROM user_exams WHERE examsId = ?', [id]);
      await m.delete(Exam, { id });
    });
  }

  private async getExam(id: number) {
    const exam = await this.exams.findOneBy({ id });
    if (!exam) throw new NotFoundException('考试不存在');
    return exam;
  }

  // ---------- candidates ----------

  async candidatesOf(user: User, examId: number) {
    await this.access.assert(user, examId);
    const rows = await this.candidates.find({ where: { examId } });
    const versions = await this.photos.versions(rows.map((r) => r.studentNo));
    return rows.sort(compareCandidates).map((c) => this.dto(c, versions.get(c.studentNo)));
  }

  private dto(c: Candidate, photoVersion?: string | null) {
    const { exam, ...rest } = c as any;
    return { ...rest, photoVersion: photoVersion ?? null };
  }

  private async withPhoto(c: Candidate) {
    const versions = await this.photos.versions([c.studentNo]);
    return this.dto(c, versions.get(c.studentNo));
  }

  private async getCandidate(id: number) {
    const c = await this.candidates.findOneBy({ id });
    if (!c) throw new NotFoundException('考生不存在');
    return c;
  }

  async addCandidate(examId: number, body: any) {
    await this.getExam(examId);
    const studentNo = str(body.studentNo, '学号', { required: true, max: 40 });
    if (await this.candidates.findOneBy({ examId, studentNo })) throw new BadRequestException('该学号已在本场考试中');
    const c = await this.candidates.save(
      this.candidates.create({
        examId,
        studentNo,
        name: str(body.name, '姓名', { required: true, max: 50 }),
        seatNo: str(body.seatNo, '座位号', { max: 20 }) || null,
        seq: body.seq ? Number(body.seq) : null,
      }),
    );
    this.realtime.emitTo([rooms.exam(examId), rooms.admin], 'candidates:reload', { examId });
    return this.withPhoto(c);
  }

  async updateCandidate(id: number, body: any) {
    const c = await this.getCandidate(id);
    if (body.name !== undefined) c.name = str(body.name, '姓名', { required: true, max: 50 });
    if (body.seatNo !== undefined) c.seatNo = str(body.seatNo, '座位号', { max: 20 }) || null;
    if (body.studentNo !== undefined) {
      const sno = str(body.studentNo, '学号', { required: true, max: 40 });
      const dup = await this.candidates.findOneBy({ examId: c.examId, studentNo: sno });
      if (dup && dup.id !== c.id) throw new BadRequestException('该学号已在本场考试中');
      c.studentNo = sno;
    }
    await this.candidates.save(c);
    return this.broadcast(c);
  }

  async removeCandidate(id: number) {
    const c = await this.getCandidate(id);
    await this.logs.delete({ candidateId: id });
    await this.candidates.delete({ id });
    this.realtime.emitTo([rooms.exam(c.examId), rooms.admin], 'candidates:reload', { examId: c.examId });
  }

  private async broadcast(c: Candidate) {
    const dto = await this.withPhoto(c);
    this.realtime.emitTo([rooms.exam(c.examId), rooms.admin], 'candidate:updated', dto);
    return dto;
  }

  // ---------- checking ----------

  async check(user: User, id: number, body: any) {
    const c = await this.getCandidate(id);
    await this.access.assert(user, c.examId);

    const result = body.result;
    if (result !== 'normal' && result !== 'issue') throw new BadRequestException('核查结果无效');
    let issueType: IssueType | null = null;
    let note: string | null = null;
    if (result === 'issue') {
      if (!(body.issueType in ISSUE_LABELS)) throw new BadRequestException('请选择问题类型');
      issueType = body.issueType;
      note = str(body.note, '情况说明', { max: 500, required: issueType === 'other' }) || null;
    }

    Object.assign(c, {
      status: result,
      issueType,
      issueNote: note,
      checkedById: user.id,
      checkedByName: user.displayName || user.username,
      checkedAt: new Date(),
      handled: false,
      handleNote: null,
      handledByName: null,
      handledAt: null,
    });
    await this.candidates.save(c);
    const log = await this.log(c, user, result, issueType, note);
    const dto = await this.broadcast(c);
    await this.emitFeed(log, c);
    return dto;
  }

  async reset(user: User, id: number) {
    const c = await this.getCandidate(id);
    Object.assign(c, {
      status: 'pending',
      issueType: null,
      issueNote: null,
      checkedById: null,
      checkedByName: null,
      checkedAt: null,
      handled: false,
      handleNote: null,
      handledByName: null,
      handledAt: null,
    });
    await this.candidates.save(c);
    const log = await this.log(c, user, 'reset', null, null);
    await this.emitFeed(log, c);
    return this.broadcast(c);
  }

  async handle(user: User, id: number, body: any) {
    const c = await this.getCandidate(id);
    if (c.status !== 'issue') throw new BadRequestException('该考生没有异常记录');
    const note = str(body.note, '处理意见', { max: 500 }) || null;
    Object.assign(c, {
      handled: true,
      handleNote: note,
      handledByName: user.displayName || user.username,
      handledAt: new Date(),
    });
    await this.candidates.save(c);
    const log = await this.log(c, user, 'handle', c.issueType, note);
    await this.emitFeed(log, c);
    if (c.checkedById) {
      await this.chat.system(
        c.checkedById,
        `${c.handledByName} 已处理你上报的「${ISSUE_LABELS[c.issueType!]}」异常${note ? `：${note}` : ''}`,
        c,
      );
    }
    return this.broadcast(c);
  }

  private log(c: Candidate, user: User, action: string, issueType: string | null, note: string | null) {
    return this.logs.save(
      this.logs.create({
        examId: c.examId,
        candidateId: c.id,
        action,
        issueType,
        note,
        userId: user.id,
        userName: user.displayName || user.username,
      }),
    );
  }

  private async emitFeed(log: CheckLog, c: Candidate) {
    const exam = await this.exams.findOneBy({ id: c.examId });
    this.realtime.emitTo(rooms.admin, 'feed', this.feedItem(log, c, exam?.name ?? ''));
  }

  private feedItem(log: CheckLog, c: Candidate, examName: string) {
    return {
      ...log,
      handled: c.status === 'issue' && c.handled,
      examName,
      candidate: { id: c.id, name: c.name, studentNo: c.studentNo, seatNo: c.seatNo },
      candidateLabel: candidateLabel(c),
      issueLabel: log.issueType ? ISSUE_LABELS[log.issueType as IssueType] : null,
    };
  }

  /** Recent activity for the admin's live sidebar when it first loads. */
  async feed(limit = 60) {
    const logs = await this.logs.find({ order: { id: 'DESC' }, take: limit });
    const cands = await this.candidates.findBy({ id: In(logs.map((l) => l.candidateId)) });
    const exams = await this.exams.find();
    const cMap = new Map(cands.map((c) => [c.id, c]));
    const eMap = new Map(exams.map((e) => [e.id, e.name]));
    return logs
      .filter((l) => cMap.has(l.candidateId))
      .map((l) => this.feedItem(l, cMap.get(l.candidateId)!, eMap.get(l.examId) ?? ''));
  }

  async issues(query: { examId?: string; handled?: string }) {
    const where: any = { status: 'issue' };
    if (query.examId) where.examId = Number(query.examId);
    if (query.handled === 'true' || query.handled === 'false') where.handled = query.handled === 'true';
    const rows = await this.candidates.find({ where, order: { checkedAt: 'DESC' } });
    const versions = await this.photos.versions(rows.map((r) => r.studentNo));
    const exams = new Map((await this.exams.find()).map((e) => [e.id, e.name]));
    return rows.map((c) => ({ ...this.dto(c, versions.get(c.studentNo)), examName: exams.get(c.examId) ?? '' }));
  }

  async history(id: number) {
    return this.logs.find({ where: { candidateId: id }, order: { id: 'DESC' } });
  }

  // ---------- import / export ----------

  async inspect(buffer: Buffer) {
    try {
      const { sheets, recommended } = await readWorkbook(buffer);
      return { sheets: sheets.map((s) => s.info), recommended };
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * merge: upsert by student number, keeping existing check results.
   * replace: same, but also removes candidates that are no longer in the sheet.
   */
  async import(examId: number, buffer: Buffer, sheetName: string | undefined, mode: string) {
    await this.getExam(examId);
    let parsed: Awaited<ReturnType<typeof readWorkbook>>;
    try {
      parsed = await readWorkbook(buffer);
    } catch (e) {
      throw new BadRequestException(e.message);
    }
    const target = parsed.sheets.find((s) => s.info.name === (sheetName || parsed.recommended));
    if (!target) throw new BadRequestException('没有可导入的工作表');
    if (!target.info.ok) throw new BadRequestException(`工作表「${target.info.name}」${target.info.reason}`);

    const errors: { row: number; reason: string }[] = [];
    const byStudent = new Map<string, SheetRow>();
    target.rows.forEach((r, i) => {
      const rowNo = (target.info.headerRow ?? 1) + i + 1;
      if (!r.studentNo) return errors.push({ row: rowNo, reason: '学号为空' });
      if (!r.name) return errors.push({ row: rowNo, reason: '姓名为空' });
      if (r.studentNo.length > 40) return errors.push({ row: rowNo, reason: '学号过长' });
      if (byStudent.has(r.studentNo)) errors.push({ row: rowNo, reason: `学号 ${r.studentNo} 重复，以最后一行为准` });
      byStudent.set(r.studentNo, r);
    });

    let inserted = 0;
    let updated = 0;
    let removed = 0;
    await this.ds.transaction(async (m) => {
      const repo = m.getRepository(Candidate);
      const existing = new Map((await repo.findBy({ examId })).map((c) => [c.studentNo, c]));
      const toSave: Candidate[] = [];
      for (const row of byStudent.values()) {
        const c = existing.get(row.studentNo);
        if (c) {
          Object.assign(c, { name: row.name, seatNo: row.seatNo, seq: row.seq });
          toSave.push(c);
          updated++;
        } else {
          toSave.push(repo.create({ examId, ...row }));
          inserted++;
        }
      }
      await repo.save(toSave, { chunk: 200 });
      if (mode === 'replace') {
        const stale = [...existing.values()].filter((c) => !byStudent.has(c.studentNo)).map((c) => c.id);
        for (let i = 0; i < stale.length; i += 500) {
          const ids = stale.slice(i, i + 500);
          await m.delete(CheckLog, { candidateId: In(ids) });
          await repo.delete({ id: In(ids) });
        }
        removed = stale.length;
      }
    });

    this.realtime.emitTo([rooms.exam(examId), rooms.admin], 'candidates:reload', { examId });
    const all = await this.candidates.findBy({ examId });
    const versions = await this.photos.versions(all.map((c) => c.studentNo));
    return {
      sheet: target.info.name,
      inserted,
      updated,
      removed,
      total: all.length,
      missingPhotos: all.filter((c) => !versions.has(c.studentNo)).map((c) => c.studentNo),
      errors,
    };
  }

  async export(examId: number): Promise<{ name: string; buffer: Buffer }> {
    const exam = await this.getExam(examId);
    const rows = (await this.candidates.find({ where: { examId } })).sort(compareCandidates);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('核查结果');
    ws.columns = [
      { header: '序号', key: 'seq', width: 8 },
      { header: '名称', key: 'name', width: 12 },
      { header: '学号', key: 'studentNo', width: 14 },
      { header: '座位号', key: 'seatNo', width: 10 },
      { header: '核查结果', key: 'status', width: 10 },
      { header: '问题类型', key: 'issueType', width: 10 },
      { header: '情况说明', key: 'issueNote', width: 30 },
      { header: '核查人', key: 'checkedByName', width: 12 },
      { header: '核查时间', key: 'checkedAt', width: 20 },
      { header: '是否已处理', key: 'handled', width: 10 },
      { header: '处理意见', key: 'handleNote', width: 30 },
      { header: '处理人', key: 'handledByName', width: 12 },
    ];
    const fmt = (d: Date | null) => (d ? new Date(d).toLocaleString('zh-CN', { hour12: false }) : '');
    for (const c of rows) {
      const row = ws.addRow({
        ...c,
        status: STATUS_LABELS[c.status],
        issueType: c.issueType ? ISSUE_LABELS[c.issueType] : '',
        checkedAt: fmt(c.checkedAt),
        handled: c.status === 'issue' ? (c.handled ? '是' : '否') : '',
      });
      if (c.status === 'issue') row.font = { color: { argb: 'FFCF1322' } };
    }
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    return { name: `${exam.name}-核查结果.xlsx`, buffer: Buffer.from(await wb.xlsx.writeBuffer()) };
  }
}
