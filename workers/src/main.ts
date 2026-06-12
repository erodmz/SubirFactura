import { Worker, type ConnectionOptions } from 'bullmq';
import { QUEUE_OCR } from '@facturard/shared';

const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
const connection: ConnectionOptions = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  password: redisUrl.password || undefined,
  // BullMQ exige maxRetriesPerRequest: null en workers
  maxRetriesPerRequest: null,
};

// Stub del pipeline OCR. La Fase 2 implementa aquí la llamada a Claude API
// con la imagen desde MinIO, reglas de confianza y validaciones determinísticas.
const ocrWorker = new Worker(
  QUEUE_OCR,
  async (job) => {
    console.log(`[ocr] trabajo recibido: ${job.id}`, job.data);
    return { processed: false, reason: 'pipeline OCR pendiente (Fase 2)' };
  },
  { connection },
);

ocrWorker.on('failed', (job, err) => {
  console.error(`[ocr] trabajo ${job?.id} falló:`, err.message);
});

console.log(`Worker FacturaRD escuchando la cola "${QUEUE_OCR}"`);

async function shutdown(signal: string) {
  console.log(`${signal} recibido, cerrando worker...`);
  await ocrWorker.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
