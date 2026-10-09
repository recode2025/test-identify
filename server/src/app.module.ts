import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'fs';
import { join } from 'path';
import { DATA_DIR, WEB_DIST } from './config';
import { ENTITIES } from './entities';
import { AuthModule } from './auth/auth.module';
import { RealtimeModule } from './realtime/realtime.module';
import { PhotosModule } from './photos/photos.module';
import { ChatModule } from './chat/chat.module';
import { ExamsModule } from './exams/exams.module';
import { UsersModule } from './users/users.module';
import { HealthController } from './health.controller';

const staticModules = existsSync(WEB_DIST)
  ? [
      ServeStaticModule.forRoot({
        rootPath: WEB_DIST,
        exclude: ['/api/{*any}', '/socket.io/{*any}'],
        serveStaticOptions: {
          // Hashed asset files never change; index.html must always be revalidated.
          setHeaders: (res, path) =>
            res.setHeader('Cache-Control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'),
        },
      }),
    ]
  : [];

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: join(DATA_DIR, 'identify.db'),
      entities: ENTITIES,
      synchronize: true,
      // WAL lets readers proceed while a check is being written.
      prepareDatabase: (db: any) => {
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.pragma('foreign_keys = ON');
      },
    }),
    ...staticModules,
    AuthModule,
    RealtimeModule,
    PhotosModule,
    ChatModule,
    ExamsModule,
    UsersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
