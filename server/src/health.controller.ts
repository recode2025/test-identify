import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from './auth/auth.decorators';

/** Liveness probe for Docker / uptime monitors; also touches the database. */
@Controller('health')
export class HealthController {
  constructor(private readonly ds: DataSource) {}

  @Public()
  @Get()
  async health() {
    await this.ds.query('SELECT 1');
    return { ok: true, uptime: Math.round(process.uptime()) };
  }
}
