import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { ExamsService } from './exams.service';
import { buildTemplate } from './excel';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { intId } from '../common/http';
import type { User } from '../entities';

const excelUpload = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function sendXlsx(res: Response, name: string, buffer: Buffer) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.end(buffer);
}

@Controller()
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Get('exams')
  list(@CurrentUser() user: User) {
    return this.exams.list(user);
  }

  @Roles('admin')
  @Post('exams')
  create(@Body() body: any) {
    return this.exams.create(body);
  }

  @Roles('admin')
  @Patch('exams/:id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.exams.update(intId(id), body);
  }

  @Roles('admin')
  @Delete('exams/:id')
  async remove(@Param('id') id: string) {
    await this.exams.remove(intId(id));
    return { ok: true };
  }

  @Get('exams/:id/candidates')
  candidates(@CurrentUser() user: User, @Param('id') id: string) {
    return this.exams.candidatesOf(user, intId(id));
  }

  @Roles('admin')
  @Post('exams/:id/candidates')
  addCandidate(@Param('id') id: string, @Body() body: any) {
    return this.exams.addCandidate(intId(id), body);
  }

  @Roles('admin')
  @Get('import/template.xlsx')
  async template(@Res() res: Response) {
    sendXlsx(res, '考生名单模板.xlsx', await buildTemplate());
  }

  @Roles('admin')
  @Post('import/inspect')
  @UseInterceptors(excelUpload)
  inspect(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('请选择 Excel 文件');
    return this.exams.inspect(file.buffer);
  }

  @Roles('admin')
  @Post('exams/:id/import')
  @UseInterceptors(excelUpload)
  import(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Body() body: any) {
    if (!file) throw new BadRequestException('请选择 Excel 文件');
    return this.exams.import(intId(id), file.buffer, body.sheet || undefined, body.mode);
  }

  @Roles('admin')
  @Get('exams/:id/export.xlsx')
  async export(@Param('id') id: string, @Res() res: Response) {
    const { name, buffer } = await this.exams.export(intId(id));
    sendXlsx(res, name, buffer);
  }

  @Post('candidates/:id/check')
  check(@CurrentUser() user: User, @Param('id') id: string, @Body() body: any) {
    return this.exams.check(user, intId(id), body);
  }

  @Roles('admin')
  @Patch('candidates/:id')
  updateCandidate(@Param('id') id: string, @Body() body: any) {
    return this.exams.updateCandidate(intId(id), body);
  }

  @Roles('admin')
  @Delete('candidates/:id')
  async removeCandidate(@Param('id') id: string) {
    await this.exams.removeCandidate(intId(id));
    return { ok: true };
  }

  @Roles('admin')
  @Post('candidates/:id/reset')
  reset(@CurrentUser() user: User, @Param('id') id: string) {
    return this.exams.reset(user, intId(id));
  }

  @Roles('admin')
  @Post('candidates/:id/handle')
  handle(@CurrentUser() user: User, @Param('id') id: string, @Body() body: any) {
    return this.exams.handle(user, intId(id), body);
  }

  @Roles('admin')
  @Get('candidates/:id/history')
  history(@Param('id') id: string) {
    return this.exams.history(intId(id));
  }

  @Roles('admin')
  @Get('issues')
  issues(@Query() query: any) {
    return this.exams.issues(query);
  }

  @Roles('admin')
  @Get('feed')
  feed() {
    return this.exams.feed();
  }
}
