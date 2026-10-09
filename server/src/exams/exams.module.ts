import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';
import { Candidate, CheckLog, Exam } from '../entities';
import { PhotosModule } from '../photos/photos.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [TypeOrmModule.forFeature([Exam, Candidate, CheckLog]), PhotosModule, ChatModule],
  controllers: [ExamsController],
  providers: [ExamsService],
})
export class ExamsModule {}
