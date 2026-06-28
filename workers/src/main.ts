import { Worker, type ConnectionOptions } from 'bullmq';
import { QUEUE_OCR } from '@facturard/shared';
import { prisma } from '@facturard/shared/db';
import { handleOcrFailure, processOcrJob, type OcrJobData } from './ocr/processor';

const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
const connection: ConnectionOptions = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  password: redisUrl.password || undefined,
  // BullMQ exige maxRetriesPerRequest: null en workers
  maxRetriesPerRequest: null,
};

const ocrWorker = new Worker<OcrJobData>(QUEUE_OCR, processOcrJob, {
  connection,
  // Claude API es el cuello de botella; 3 facturas en paralelo por worker
  concurrency: Number(process.env.OCR_CONCURRENCY ?? 3),
});

ocrWorker.on('failed', (job, err) => {
  void handleOcrFailure(job, err);
});

console.log(`Worker SubirFactura escuchando la cola "${QUEUE_OCR}"`);

async function shutdown(signal: string) {
  console.log(`${signal} recibido, cerrando worker...`);
  await ocrWorker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
