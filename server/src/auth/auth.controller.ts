import { BadRequestException, Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from './auth.decorators';
import { str } from '../common/http';
import type { User } from '../entities';

const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax' as const, maxAge: 7 * 24 * 3600 * 1000 };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() body: any, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(str(body.username, '账号', { required: true }), str(body.password, '密码', { required: true }));
    res.cookie('token', result.token, COOKIE_OPTS);
    return result;
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('token');
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: User) {
    return this.auth.publicUser(user);
  }

  @Post('password')
  async password(@CurrentUser() user: User, @Body() body: any, @Res({ passthrough: true }) res: Response) {
    const next = str(body.newPassword, '新密码', { required: true, max: 64 });
    if (next.length < 6) throw new BadRequestException('新密码至少 6 位');
    const result = await this.auth.changePassword(user, str(body.oldPassword, '原密码', { required: true }), next);
    res.cookie('token', result.token, COOKIE_OPTS);
    return result;
  }
}
