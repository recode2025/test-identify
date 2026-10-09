import { join, resolve } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';

export const DATA_DIR = resolve(process.env.DATA_DIR || join(__dirname, '..', 'data'));
export const PHOTO_DIR = join(DATA_DIR, 'photos');
export const TMP_DIR = join(DATA_DIR, 'tmp');
export const WEB_DIST = resolve(process.env.WEB_DIST || join(__dirname, '..', '..', 'web', 'dist'));

export const PORT = Number(process.env.PORT || 3000);
/** 0.0.0.0 for direct LAN access; 127.0.0.1 when behind Nginx. */
export const HOST = process.env.HOST || '0.0.0.0';
export const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';
export const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

/** Photo derivatives: the list uses thumb, the check page uses medium. */
export const PHOTO_SIZES = {
  thumb: { width: 160, height: 220, quality: 70 },
  medium: { width: 720, height: 960, quality: 78 },
} as const;
export type PhotoSize = keyof typeof PHOTO_SIZES;

for (const dir of [DATA_DIR, TMP_DIR, ...Object.keys(PHOTO_SIZES).map((s) => join(PHOTO_DIR, s))]) {
  mkdirSync(dir, { recursive: true });
}

/** A random secret generated on first boot and kept in the data dir, unless JWT_SECRET is set. */
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = join(DATA_DIR, '.jwt-secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const secret = randomBytes(32).toString('hex');
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}
export const JWT_SECRET = loadSecret();
