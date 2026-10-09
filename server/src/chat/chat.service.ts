import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { Candidate, Message, User } from '../entities';
import { RealtimeGateway, rooms } from '../realtime/realtime.gateway';

export const candidateLabel = (c: Pick<Candidate, 'name' | 'studentNo' | 'seatNo'>) =>
  `${c.name}（${c.studentNo}${c.seatNo ? ` · 座位 ${c.seatNo}` : ''}）`;

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Message) private readonly messages: Repository<Message>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Candidate) private readonly candidates: Repository<Candidate>,
    private readonly realtime: RealtimeGateway,
  ) {}

  async send(sender: User, body: { content?: string; staffId?: number; candidateId?: number }) {
    const content = (body.content ?? '').trim();
    if (!content) throw new BadRequestException('消息不能为空');
    if (content.length > 1000) throw new BadRequestException('消息过长');

    let staffId = sender.id;
    if (sender.role === 'admin') {
      const staff = await this.users.findOneBy({ id: Number(body.staffId) });
      if (!staff || staff.role !== 'staff') throw new BadRequestException('请选择员工会话');
      staffId = staff.id;
    }

    let candidate: Candidate | null = null;
    if (body.candidateId) {
      candidate = await this.candidates.findOneBy({ id: Number(body.candidateId) });
    }

    const msg = await this.messages.save(
      this.messages.create({
        staffId,
        senderId: sender.id,
        senderName: sender.displayName || sender.username,
        senderRole: sender.role,
        content,
        candidateId: candidate?.id ?? null,
        candidateLabel: candidate ? candidateLabel(candidate) : null,
        readByAdmin: sender.role === 'admin',
        readByStaff: sender.role === 'staff',
      }),
    );
    this.push(msg);
    return msg;
  }

  /** Automatic notices (e.g. "issue handled") appear in the staff member's chat. */
  async system(staffId: number, content: string, candidate?: Candidate) {
    const msg = await this.messages.save(
      this.messages.create({
        staffId,
        senderId: null,
        senderName: '系统通知',
        senderRole: 'system',
        content,
        candidateId: candidate?.id ?? null,
        candidateLabel: candidate ? candidateLabel(candidate) : null,
        readByAdmin: true,
        readByStaff: false,
      }),
    );
    this.push(msg);
    return msg;
  }

  private push(msg: Message) {
    this.realtime.emitTo([rooms.admin, rooms.user(msg.staffId)], 'chat:message', msg);
  }

  async list(user: User, staffIdParam: unknown, beforeId?: unknown) {
    const staffId = user.role === 'admin' ? Number(staffIdParam) : user.id;
    if (!staffId) throw new BadRequestException('缺少会话');
    if (user.role !== 'admin' && Number(staffIdParam || user.id) !== user.id) throw new ForbiddenException();
    const rows = await this.messages.find({
      where: { staffId, ...(beforeId ? { id: LessThan(Number(beforeId)) } : {}) },
      order: { id: 'DESC' },
      take: 50,
    });
    return rows.reverse();
  }

  async markRead(user: User, staffIdParam: unknown) {
    if (user.role === 'admin') {
      const staffId = Number(staffIdParam);
      await this.messages.update({ staffId, readByAdmin: false }, { readByAdmin: true });
      this.realtime.emitTo(rooms.admin, 'chat:read', { staffId });
    } else {
      await this.messages.update({ staffId: user.id, readByStaff: false }, { readByStaff: true });
    }
    return { ok: true };
  }

  async unreadForStaff(staffId: number) {
    return this.messages.count({ where: { staffId, readByStaff: false } });
  }

  /** Admin sidebar: one row per staff account, most recent conversation first. */
  async conversations() {
    const staff = await this.users.find({ where: { role: 'staff' }, order: { id: 'ASC' } });
    const stats: { staffId: number; lastId: number; unread: number }[] = await this.messages.query(
      `SELECT staffId, MAX(id) AS lastId,
              SUM(CASE WHEN readByAdmin = 0 THEN 1 ELSE 0 END) AS unread
       FROM messages GROUP BY staffId`,
    );
    const lastIds = stats.map((s) => s.lastId);
    const lastMessages = lastIds.length ? await this.messages.findBy({ id: In(lastIds) }) : [];
    const lastById = new Map(lastMessages.map((m) => [m.id, m]));
    const statByStaff = new Map(stats.map((s) => [s.staffId, s]));

    return staff
      .map((u) => {
        const s = statByStaff.get(u.id);
        return {
          staffId: u.id,
          username: u.username,
          displayName: u.displayName || u.username,
          enabled: u.enabled,
          online: this.realtime.isOnline(u.id),
          unread: Number(s?.unread ?? 0),
          last: s ? lastById.get(s.lastId) ?? null : null,
        };
      })
      .sort((a, b) => (b.last?.id ?? 0) - (a.last?.id ?? 0) || a.staffId - b.staffId);
  }
}
