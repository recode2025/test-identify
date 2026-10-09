import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { intId } from '../common/http';
import type { User } from '../entities';

@Roles('admin')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body() body: any) {
    return this.users.create(body);
  }

  @Post('batch')
  batch(@Body() body: any) {
    return this.users.batchCreate(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() actor: User) {
    return this.users.update(intId(id), body, actor);
  }

  @Post(':id/password')
  password(@Param('id') id: string, @Body() body: any) {
    return this.users.resetPassword(intId(id), body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() actor: User) {
    await this.users.remove(intId(id), actor);
    return { ok: true };
  }
}
