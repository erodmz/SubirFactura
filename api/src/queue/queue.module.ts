import { Global, Module } from '@nestjs/common';
import { OcrQueueService } from './ocr-queue.service';

@Global()
@Module({
  providers: [OcrQueueService],
  exports: [OcrQueueService],
})
export class QueueModule {}
