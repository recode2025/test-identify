import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { Exam, Role, User } from '../entities';
import { RealtimeGateway, rooms } from '../realtime/realtime.gateway';
import { str } from '../common/http';

// No 0/O/1/l/I so passwords read back unambiguously when handed out on paper.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const randomPassword = (len = 8) => Array.from({ length: len }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

const USERNAME_RE = /^[A-Za-z0-9_.-]{2,32}$/;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Exam) private readonly exams: Repository<Exam>,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list() {
    const users = await this.users.find({ relations: { exams: true }, order: { role: 'ASC', id: 'ASC' } });
    return users.map((u) => this.dto(u));
  }

  private dto(u: User) {
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      enabled: u.enabled,
      createdAt: u.createdAt,
      examIds: (u.exams ?? []).map((e) => e.id),
      online: this.realtime.isOnline(u.id),
    };
  }

  private async resolveExams(ids: unknown): Promise<Exam[]> {
    if (!Array.isArray(ids) || !ids.length) return [];
    return this.exams.findBy({ id: In(ids.map(Number)) });
  }

  private role(v: unknown): Role {
    return v === 'admin' ? 'admin' : 'staff';
  }

  async create(body: any) {
    const username = str(body.username, '账号', { required: true });
    if (!USERNAME_RE.test(username)) throw new BadRequestException('账号只能包含字母、数字、下划线，2-32 位');
    if (await this.users.findOneBy({ username })) throw new BadRequestException('账号已存在');
    const password = str(body.password, '密码', { max: 64 }) || randomPassword();
    if (password.length < 6) throw new BadRequestException('密码至少 6 位');
    const user = await this.users.save(
      this.users.create({
        username,
        passwordHash: await bcrypt.hash(password, 10),
        displayName: str(body.displayName, '姓名', { max: 30 }) || username,
        role: this.role(body.role),
        exams: await this.resolveExams(body.examIds),
      }),
    );
    return { ...this.dto(user), password };
  }

  /** Generates e.g. staff01..staff20 with random passwords, all assigned to the same exams. */
  async batchCreate(body: any) {
    const prefix = str(body.prefix, '账号前缀', { required: true, max: 20 });
    const count = Number(body.count);
    const start = Number(body.start ?? 1);
    if (!Number.isInteger(count) || count < 1 || count > 200) throw new BadRequestException('数量需在 1-200 之间');
    if (!Number.isInteger(start) || start < 0) throw new BadRequestException('起始编号无效');
    const width = Math.max(2, String(start + count - 1).length);
    const names = Array.from({ length: count }, (_, i) => `${prefix}${String(start + i).padStart(width, '0')}`);
    if (!names.every((n) => USERNAME_RE.test(n))) throw new BadRequestException('账号前缀只能包含字母、数字、下划线');
    const taken = await this.users.findBy({ username: In(names) });
    if (taken.length) throw new BadRequestException(`账号已存在：${taken.map((u) => u.username).join('、')}`);

    const exams = await this.resolveExams(body.examIds);
    const created: { id: number; username: string; displayName: string; password: string }[] = [];
    for (const [i, username] of names.entries()) {
      const password = randomPassword();
      const displayName = body.displayPrefix ? `${body.displayPrefix}${String(start + i).padStart(width, '0')}` : username;
      const user = await this.users.save(
        this.users.create({ username, displayName, passwordHash: await bcrypt.hash(password, 8), role: 'staff', exams }),
      );
      created.push({ id: user.id, username, displayName, password });
    }
    return created;
  }

  async update(id: number, body: any, actor: User) {
    const user = await this.users.findOne({ where: { id }, relations: { exams: true } });
    if (!user) throw new NotFoundException('账号不存在');
    let revoke = false;
    if (body.displayName !== undefined) user.displayName = str(body.displayName, '姓名', { max: 30 }) || user.username;
    if (body.role !== undefined && this.role(body.role) !== user.role) {
      if (user.id === actor.id) throw new BadRequestException('不能修改自己的角色');
      if (user.role === 'admin') await this.assertAnotherAdmin(user.id);
      user.role = this.role(body.role);
      revoke = true;
    }
    if (body.enabled !== undefined && !!body.enabled !== user.enabled) {
      if (user.id === actor.id) throw new BadRequestException('不能停用自己');
      user.enabled = !!body.enabled;
      revoke = !user.enabled || revoke;
    }
    if (body.examIds !== undefined) user.exams = await this.resolveExams(body.examIds);
    if (revoke) user.tokenVersion += 1;
    await this.users.save(user);
    if (revoke) this.kick(user.id);
    else if (body.examIds !== undefined) this.realtime.emitTo(rooms.user(user.id), 'exams:changed', {});
    return this.dto(user);
  }

  async resetPassword(id: number, body: any) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('账号不存在');
    const password = str(body.password, '密码', { max: 64 }) || randomPassword();
    if (password.length < 6) throw new BadRequestException('密码至少 6 位');
    user.passwordHash = await bcrypt.hash(password, 10);
    user.tokenVersion += 1;
    await this.users.save(user);
    this.kick(user.id);
    return { username: user.username, password };
  }

  async remove(id: number, actor: User) {
    if (id === actor.id) throw new BadRequestException('不能删除自己');
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('账号不存在');
    if (user.role === 'admin') await this.assertAnotherAdmin(id);
    await this.users.delete({ id });
    this.kick(id);
  }

  private async assertAnotherAdmin(excludeId: number) {
    const admins = await this.users.find({ where: { role: 'admin', enabled: true } });
    if (!admins.some((a) => a.id !== excludeId)) throw new BadRequestException('至少保留一个可用的管理员');
  }

  private kick(userId: number) {
    this.realtime.emitTo(rooms.user(userId), 'auth:error', {});
    this.realtime.server?.in(rooms.user(userId)).disconnectSockets(true);
  }
}
