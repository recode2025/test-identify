import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { ExamAccessService } from '../exams/exam-access.service';
import type { User } from '../entities';

export const rooms = {
  admin: 'admin',
  staff: 'staff',
  user: (id: number) => `user:${id}`,
  exam: (id: number) => `exam:${id}`,
};

function cookieToken(cookie: string | undefined) {
  return cookie?.match(/(?:^|;\s*)token=([^;]+)/)?.[1];
}

/**
 * socket.io transport: WebSocket first, automatic fallback to HTTP long-polling,
 * so admins get live updates even behind proxies that block WebSocket.
 */
@WebSocketGateway({ path: '/socket.io', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('Realtime');
  /** userId -> number of open sockets (a user may have several tabs/devices). */
  private readonly online = new Map<number, number>();
  private adminOnline = 0;

  @WebSocketServer() server: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly access: ExamAccessService,
  ) {}

  async handleConnection(socket: Socket) {
    const token = (socket.handshake.auth?.token as string) || cookieToken(socket.handshake.headers.cookie);
    const user = await this.auth.verify(token);
    if (!user) {
      socket.emit('auth:error');
      socket.disconnect(true);
      return;
    }
    socket.data.user = user;
    socket.join(rooms.user(user.id));
    socket.join(user.role === 'admin' ? rooms.admin : rooms.staff);

    const count = (this.online.get(user.id) ?? 0) + 1;
    this.online.set(user.id, count);
    if (user.role === 'admin') {
      this.adminOnline += 1;
      if (this.adminOnline === 1) this.server.to(rooms.staff).emit('admin:online', true);
    }
    if (count === 1) this.server.to(rooms.admin).emit('presence', { userId: user.id, online: true });

    socket.emit('admin:online', this.adminOnline > 0);
    if (user.role === 'admin') socket.emit('presence:list', [...this.online.keys()]);
  }

  handleDisconnect(socket: Socket) {
    const user: User | undefined = socket.data.user;
    if (!user) return;
    const count = (this.online.get(user.id) ?? 1) - 1;
    if (count <= 0) {
      this.online.delete(user.id);
      this.server.to(rooms.admin).emit('presence', { userId: user.id, online: false });
    } else {
      this.online.set(user.id, count);
    }
    if (user.role === 'admin') {
      this.adminOnline = Math.max(0, this.adminOnline - 1);
      if (this.adminOnline === 0) this.server.to(rooms.staff).emit('admin:online', false);
    }
  }

  /** Staff subscribe to the exam they are checking to see other staff's results live. */
  @SubscribeMessage('exam:join')
  async joinExam(@ConnectedSocket() socket: Socket, @MessageBody() examId: number) {
    const user: User = socket.data.user;
    if (!user || !(await this.access.canAccess(user, Number(examId)))) return { ok: false };
    for (const room of socket.rooms) if (room.startsWith('exam:')) socket.leave(room);
    socket.join(rooms.exam(Number(examId)));
    return { ok: true };
  }

  isOnline(userId: number) {
    return this.online.has(userId);
  }

  onlineUserIds() {
    return [...this.online.keys()];
  }

  emitTo(room: string | string[], event: string, payload: unknown) {
    this.server?.to(room).emit(event, payload);
  }
}
