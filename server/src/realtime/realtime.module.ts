import { Global, Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { ExamAccessService } from '../exams/exam-access.service';

@Global()
@Module({
  providers: [RealtimeGateway, ExamAccessService],
  exports: [RealtimeGateway, ExamAccessService],
})
export class RealtimeModule {}
