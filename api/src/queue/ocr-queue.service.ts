import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_OCR } from '@facturard/shared';

export interface OcrJobData {
  invoiceId: string;
  organizationId: string;
}

/** Productor de la cola OCR: el API nunca espera a Claude para responder (§3). */
@Injectable()
export class OcrQueueService implements OnModuleDestroy {
  private readonly queue: Queue<OcrJobData>;

  constructor() {
    const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
    this.queue = new Queue<OcrJobData>(QUEUE_OCR, {
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port || 6379),
        password: redisUrl.password || undefined,
      },
    });
  }

  /** Encola con reintentos y backoff exponencial (§5.5). */
  async enqueueExtraction(data: OcrJobData): Promise<void> {
    await this.queue.add('extract', data, {
      jobId: `invoice:${data.invoiceId}:${Date.now()}`,
      attempts: Number(process.env.OCR_MAX_RETRIES ?? 3),
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
