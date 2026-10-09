import { Injectable, OnModuleInit, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities';
import { ADMIN_PASSWORD, ADMIN_USERNAME } from '../config';

export interface TokenPayload {
  sub: number;
  tv: number;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger('Auth');

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  async onModuleInit() {
    if ((await this.users.count({ where: { role: 'admin' } })) === 0) {
      await this.users.save(
        this.users.create({
          username: ADMIN_USERNAME,
          passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10),
          displayName: '管理员',
          role: 'admin',
        }),
      );
      this.logger.warn(`已创建默认管理员 ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}，请登录后立即修改密码`);
    }
  }

  async login(username: string, password: string) {
    const user = await this.users.findOne({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('账号或密码错误');
    }
    if (!user.enabled) throw new UnauthorizedException('账号已停用，请联系管理员');
    return { token: this.sign(user), user: this.publicUser(user) };
  }

  sign(user: User) {
    return this.jwt.sign({ sub: user.id, tv: user.tokenVersion } satisfies TokenPayload);
  }

  /** Resolves a token to an active user, or null. Shared by the HTTP guard and the socket gateway. */
  async verify(token: string | undefined): Promise<User | null> {
    if (!token) return null;
    try {
      const payload = this.jwt.verify<TokenPayload>(token);
      const user = await this.users.findOne({ where: { id: payload.sub } });
      if (!user || !user.enabled || user.tokenVersion !== payload.tv) return null;
      return user;
    } catch {
      return null;
    }
  }

  async changePassword(user: User, oldPassword: string, newPassword: string) {
    if (!(await bcrypt.compare(oldPassword, user.passwordHash))) {
      throw new UnauthorizedException('原密码错误');
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.tokenVersion += 1;
    await this.users.save(user);
    return { token: this.sign(user) };
  }

  publicUser(user: User) {
    return { id: user.id, username: user.username, displayName: user.displayName || user.username, role: user.role };
  }
}
