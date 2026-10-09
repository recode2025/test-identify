import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { diskStorage, memoryStorage } from 'multer';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { PhotosService } from './photos.service';
import { buildZip } from './zip-writer';
import { Roles } from '../auth/auth.decorators';
import { PHOTO_SIZES, PhotoSize, TMP_DIR } from '../config';

const SNO_RE = /^[A-Za-z0-9_-]{1,40}$/;
const utf8Name = (name: string) => Buffer.from(name, 'latin1').toString('utf8');

@Controller('photos')
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  /**
   * URLs carry ?v=<version>, so the response can be cached as immutable: re-uploading a
   * photo changes the version and therefore the URL.
   */
  @Get('file/:size/:studentNo')
  file(@Param('size') size: string, @Param('studentNo') studentNo: string, @Query('v') v: string, @Res() res: Response) {
    const sno = studentNo.replace(/\.webp$/, '');
    if (!(size in PHOTO_SIZES) || !SNO_RE.test(sno)) throw new NotFoundException();
    if (!this.photos.exists(size as PhotoSize, sno)) throw new NotFoundException('暂无照片');
    res.setHeader('Cache-Control', v ? 'private, max-age=31536000, immutable' : 'private, no-cache');
    res.sendFile(this.photos.filePath(size as PhotoSize, sno), { headers: { 'Content-Type': 'image/webp' } });
  }

  @Roles('admin')
  @Get('template.zip')
  async template(@Res() res: Response) {
    const samples = ['260450101', '260450102'];
    const files = await Promise.all(
      samples.map(async (sno) => ({
        name: `photos/${sno}.jpg`,
        data: await sharp(
          Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="100%" height="100%" fill="#e6f4ff"/>` +
              `<circle cx="150" cy="150" r="70" fill="#91caff"/><rect x="60" y="240" width="180" height="160" rx="80" fill="#91caff"/>` +
              `<text x="150" y="385" font-size="30" text-anchor="middle" font-family="Arial" fill="#0958d9">${sno}</text></svg>`,
          ),
        )
          .jpeg({ quality: 80 })
          .toBuffer(),
      })),
    );
    files.push({
      name: 'README.txt',
      data: Buffer.from(
        '\uFEFF1. 每张照片以「学号」命名，例如 260450101.jpg\r\n' +
          '2. 支持 jpg / png / bmp / webp / heic 等格式，可放在任意子文件夹中\r\n' +
          '3. 将所有照片打包为一个 zip 上传；同学号重复上传会覆盖旧照片\r\n' +
          '4. 原图无需压缩，系统会自动生成适合手机加载的小图\r\n',
      ),
    });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('照片上传模板.zip')}`);
    res.end(buildZip(files));
  }

  @Roles('admin')
  @Post('zip')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({ destination: TMP_DIR, filename: (_req, _file, cb) => cb(null, `${randomUUID()}.zip`) }),
      limits: { fileSize: 4 * 1024 * 1024 * 1024 },
    }),
  )
  zip(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('请选择 zip 文件');
    return this.photos.startZipJob(file.path, utf8Name(file.originalname));
  }

  @Roles('admin')
  @Get('jobs/:id')
  job(@Param('id') id: string) {
    return this.photos.getJob(id);
  }

  @Roles('admin')
  @Post('batch')
  @UseInterceptors(FilesInterceptor('files', 300, { storage: memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } }))
  batch(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('请选择图片');
    return this.photos.uploadMany(files);
  }

  @Roles('admin')
  @Post('single/:studentNo')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } }))
  single(@Param('studentNo') studentNo: string, @UploadedFile() file: Express.Multer.File) {
    if (!SNO_RE.test(studentNo)) throw new BadRequestException('学号格式不正确');
    if (!file) throw new BadRequestException('请选择图片');
    return this.photos.uploadSingle(studentNo, file);
  }

  @Roles('admin')
  @Delete('single/:studentNo')
  async remove(@Param('studentNo') studentNo: string) {
    await this.photos.remove(studentNo);
    return { ok: true };
  }
}
