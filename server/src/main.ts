import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { networkInterfaces } from 'os';
import { AppModule } from './app.module';
import { HOST, PORT } from './config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  // Photos are already WebP; gzip only text responses (JSON lists, JS, CSS).
  app.use(compression({ filter: (req, res) => !req.url.startsWith('/api/photos/file') && compression.filter(req, res) }));
  app.enableCors({ origin: true, credentials: true });
  app.set('trust proxy', true);
  await app.listen(PORT, HOST);

  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => `http://${n!.address}:${PORT}`);
  Logger.log(
    HOST === '0.0.0.0' ? `服务已启动: http://localhost:${PORT}  局域网: ${lan.join('  ') || '-'}` : `服务已启动: http://${HOST}:${PORT}`,
    'Bootstrap',
  );
}
bootstrap();
