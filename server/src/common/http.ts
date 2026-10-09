import { BadRequestException } from '@nestjs/common';

export function str(v: unknown, field: string, opts: { required?: boolean; max?: number } = {}): string {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  if (opts.required && !s) throw new BadRequestException(`${field}不能为空`);
  if (opts.max && s.length > opts.max) throw new BadRequestException(`${field}过长（最多 ${opts.max} 字）`);
  return s;
}

export function intId(v: unknown, field = 'id'): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new BadRequestException(`${field}无效`);
  return n;
}
