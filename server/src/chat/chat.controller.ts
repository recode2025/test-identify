import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ChatService } from './chat.service';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { User } from '../entities';

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Roles('admin')
  @Get('conversations')
  conversations() {
    return this.chat.conversations();
  }

  @Get('messages')
  messages(@CurrentUser() user: User, @Query('staffId') staffId?: string, @Query('before') before?: string) {
    return this.chat.list(user, staffId, before);
  }

  @Get('unread')
  async unread(@CurrentUser() user: User) {
    return { count: await this.chat.unreadForStaff(user.id) };
  }

  @Post('messages')
  send(@CurrentUser() user: User, @Body() body: any) {
    return this.chat.send(user, body);
  }

  @Post('read')
  read(@CurrentUser() user: User, @Body() body: any) {
    return this.chat.markRead(user, body.staffId);
  }
}
