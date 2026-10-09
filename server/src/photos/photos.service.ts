import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { rename, rm, unlink, writeFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import sharp from 'sharp';
import * as yauzl from 'yauzl';
import { Photo } from '../entities';
import { PHOTO_DIR, PHOTO_SIZES, PhotoSize } from '../config';
import { RealtimeGateway, rooms } from '../realtime/realtime.gateway';
import { decodeBmp } from './bmp';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.webp', '.gif', '.tif', '.tiff', '.heic', '.heif', '.avif']);
const MAX_IMAGE_BYTES = 60 * 1024 * 1024;
const CONCURRENCY = 3;

sharp.cache(false);

export interface PhotoJob {
  id: string;
  status: 'running' | 'done' | 'error';
  fileName: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: { name: string; reason: string }[];
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

/** Extracts the student number from a file name like "260450101.jpg" or "dir/260450101 .PNG". */
export function studentNoFromFileName(name: string): string | null {
  const stem = basename(name, extname(name)).trim();
  if (/^[A-Za-z0-9_-]+$/.test(stem)) return stem;
  const lead = stem.match(/^[A-Za-z0-9]{4,}/);
  return lead ? lead[0] : null;
}

@Injectable()
export class PhotosService {
  private readonly logger = new Logger('Photos');
  private readonly jobs = new Map<string, PhotoJob>();

  constructor(
    @InjectRepository(Photo) private readonly photos: Repository<Photo>,
    private readonly realtime: RealtimeGateway,
  ) {}

  filePath(size: PhotoSize, studentNo: string) {
    return join(PHOTO_DIR, size, `${studentNo}.webp`);
  }

  /** Decode once, write each derivative as WebP. Large originals are never stored. */
  async processImage(studentNo: string, input: Buffer, originalName: string) {
    let image: sharp.Sharp;
    if (extname(originalName).toLowerCase() === '.bmp' || input.toString('ascii', 0, 2) === 'BM') {
      const bmp = decodeBmp(input);
      if (!bmp) throw new Error('不支持的 BMP 格式');
      image = sharp(bmp.data, { raw: { width: bmp.width, height: bmp.height, channels: bmp.channels } });
    } else {
      image = sharp(input, { failOn: 'none', limitInputPixels: 20000 * 20000 });
    }
    // Rotate by EXIF so phone shots display upright, flatten transparent PNG onto white.
    const base = image.rotate().flatten({ background: '#ffffff' });
    const medium = await base
      .clone()
      .resize({ ...PHOTO_SIZES.medium, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: PHOTO_SIZES.medium.quality, effort: 4 })
      .toBuffer();
    const thumb = await sharp(medium)
      .resize({ ...PHOTO_SIZES.thumb, fit: 'cover', position: 'attention' })
      .webp({ quality: PHOTO_SIZES.thumb.quality, effort: 4 })
      .toBuffer();

    // Write to temp names then rename so readers never see half-written files.
    const writes: [PhotoSize, Buffer][] = [['medium', medium], ['thumb', thumb]];
    for (const [size, data] of writes) {
      const target = this.filePath(size, studentNo);
      const tmp = `${target}.${process.pid}.tmp`;
      await writeFile(tmp, data);
      await rename(tmp, target);
    }
    await this.photos.save({
      studentNo,
      version: Date.now().toString(36),
      originalName: basename(originalName),
      originalSize: input.length,
    });
  }

  async uploadSingle(studentNo: string, file: Express.Multer.File) {
    try {
      await this.processImage(studentNo, file.buffer, file.originalname);
    } catch (e) {
      throw new BadRequestException(`图片处理失败：${e.message}`);
    }
    return this.photos.findOneByOrFail({ studentNo });
  }

  /** Several loose images in one request, each named by student number. */
  async uploadMany(files: Express.Multer.File[]) {
    const result = { succeeded: 0, failed: [] as { name: string; reason: string }[] };
    await runPool(files, CONCURRENCY, async (file) => {
      const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const sno = studentNoFromFileName(name);
      if (!sno) return void result.failed.push({ name, reason: '文件名不是学号' });
      try {
        await this.processImage(sno, file.buffer, name);
        result.succeeded++;
      } catch (e) {
        result.failed.push({ name, reason: e.message });
      }
    });
    this.realtime.emitTo(rooms.admin, 'photos:changed', {});
    return result;
  }

  async remove(studentNo: string) {
    const photo = await this.photos.findOneBy({ studentNo });
    if (!photo) throw new NotFoundException('照片不存在');
    for (const size of Object.keys(PHOTO_SIZES) as PhotoSize[]) {
      await unlink(this.filePath(size, studentNo)).catch(() => undefined);
    }
    await this.photos.delete({ studentNo });
  }

  async versions(studentNos: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (let i = 0; i < studentNos.length; i += 500) {
      const rows = await this.photos.find({ where: { studentNo: In(studentNos.slice(i, i + 500)) }, select: ['studentNo', 'version'] });
      rows.forEach((r) => map.set(r.studentNo, r.version));
    }
    return map;
  }

  getJob(id: string) {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException('任务不存在');
    return job;
  }

  /** Starts a background ZIP import; progress is pushed over the socket and also pollable. */
  startZipJob(zipPath: string, fileName: string): PhotoJob {
    const job: PhotoJob = {
      id: randomUUID(),
      status: 'running',
      fileName,
      total: 0,
      processed: 0,
      succeeded: 0,
      failed: [],
      startedAt: Date.now(),
    };
    this.jobs.set(job.id, job);
    this.runZipJob(job, zipPath)
      .catch((e) => {
        job.status = 'error';
        job.error = e.message;
        this.logger.error(`ZIP 导入失败: ${e.message}`);
      })
      .finally(async () => {
        job.finishedAt = Date.now();
        if (job.status === 'running') job.status = 'done';
        this.emitJob(job, true);
        this.realtime.emitTo(rooms.admin, 'photos:changed', {});
        await rm(zipPath, { force: true });
        setTimeout(() => this.jobs.delete(job.id), 6 * 3600 * 1000).unref();
      });
    return job;
  }

  private lastEmit = 0;
  private emitJob(job: PhotoJob, force = false) {
    const now = Date.now();
    if (!force && now - this.lastEmit < 300) return;
    this.lastEmit = now;
    this.realtime.emitTo(rooms.admin, 'photos:job', job);
  }

  private async runZipJob(job: PhotoJob, zipPath: string) {
    const zip = await openZip(zipPath);
    try {
      const entries = (await listEntries(zip)).filter((e) => {
        const name = e.fileName;
        if (name.endsWith('/') || name.includes('__MACOSX/') || basename(name).startsWith('.')) return false;
        return IMAGE_EXT.has(extname(name).toLowerCase());
      });
      if (!entries.length) throw new Error('压缩包内没有找到图片');
      job.total = entries.length;
      this.emitJob(job, true);

      await runPool(entries, CONCURRENCY, async (entry) => {
        const name = entry.fileName;
        try {
          const sno = studentNoFromFileName(name);
          if (!sno) throw new Error('文件名不是学号');
          if (entry.uncompressedSize > MAX_IMAGE_BYTES) throw new Error('图片超过 60MB');
          await this.processImage(sno, await readEntry(zip, entry), name);
          job.succeeded++;
        } catch (e) {
          job.failed.push({ name: basename(name), reason: e.message });
        } finally {
          job.processed++;
          this.emitJob(job);
        }
      });
    } finally {
      zip.close();
    }
  }

  stats() {
    return this.photos.count();
  }

  exists(size: PhotoSize, studentNo: string) {
    return existsSync(this.filePath(size, studentNo));
  }
}

async function runPool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

function openZip(path: string) {
  return new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (err, zip) => (err ? reject(err) : resolve(zip!))),
  );
}

function listEntries(zip: yauzl.ZipFile) {
  return new Promise<yauzl.Entry[]>((resolve, reject) => {
    const entries: yauzl.Entry[] = [];
    zip.on('entry', (e: yauzl.Entry) => {
      entries.push(e);
      zip.readEntry();
    });
    zip.on('end', () => resolve(entries));
    zip.on('error', reject);
    zip.readEntry();
  });
}

function readEntry(zip: yauzl.ZipFile, entry: yauzl.Entry) {
  return new Promise<Buffer>((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) return reject(err ?? new Error('无法读取'));
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  });
}
