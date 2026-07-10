import './env'; // SIEMPRE primero: garantiza DATABASE_URL y compañía
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { QUEUE_OCR, alertRupture } from '@facturard/shared';
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

// ── Reaper: ninguna factura se queda atascada en silencio ────────────────────
// Si el worker muere a mitad de un job (deploy, crash, corte), la factura queda
// en `subida`/`procesando` sin job vivo que la retome. Cada REAPER_INTERVAL se
// buscan facturas estancadas más de STUCK_AFTER y se reencolan; se alerta por
// ntfy (con cooldown) porque una factura atascada siempre es síntoma de algo.
const reaperQueue = new Queue<OcrJobData>(QUEUE_OCR, {
  connection: {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    password: redisUrl.password || undefined,
  },
});
const REAPER_INTERVAL_MS = Number(process.env.OCR_REAPER_INTERVAL_MS ?? 5 * 60 * 1000);
const STUCK_AFTER_MS = Number(process.env.OCR_STUCK_AFTER_MS ?? 15 * 60 * 1000);

async function reapStuckInvoices(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STUCK_AFTER_MS);
    const stuck = await prisma.invoice.findMany({
      where: { estado: { in: ['subida', 'procesando'] }, updatedAt: { lt: cutoff } },
      select: { id: true, organizationId: true },
      take: 25,
    });
    if (stuck.length === 0) return;

    // No duplicar: si la factura ya tiene un job pendiente/activo, se respeta.
    const pending = await reaperQueue.getJobs(['waiting', 'active', 'delayed', 'prioritized']);
    const pendingIds = new Set(pending.map((j) => j.data?.invoiceId));

    for (const inv of stuck) {
      if (pendingIds.has(inv.id)) continue;
      console.warn(`[reaper] factura ${inv.id} atascada sin job; reencolando`);
      await reaperQueue.add(
        'extract',
        { invoiceId: inv.id, organizationId: inv.organizationId },
        {
          jobId: `invoice:${inv.id}:${Date.now()}`,
          attempts: Number(process.env.OCR_MAX_RETRIES ?? 3),
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
      await alertRupture({
        key: 'ocr.reaper',
        title: 'Factura atascada reencolada automáticamente',
        message:
          'Había factura(s) en subida/procesando sin job vivo (¿worker caído a mitad?). El reaper las reencoló.',
        context: { invoiceId: inv.id, organizationId: inv.organizationId },
      });
    }
  } catch (err) {
    // El reaper jamás tumba el worker; se reintenta en el próximo ciclo.
    console.error('[reaper] error en la pasada:', err);
  }
}

const reaperTimer = setInterval(() => void reapStuckInvoices(), REAPER_INTERVAL_MS);
// Pasada temprana al arrancar: recupera lo que haya dejado una caída previa.
const reaperKickoff = setTimeout(() => void reapStuckInvoices(), 10_000);

console.log(`Worker SubirFactura escuchando la cola "${QUEUE_OCR}"`);

async function shutdown(signal: string) {
  console.log(`${signal} recibido, cerrando worker...`);
  clearInterval(reaperTimer);
  clearTimeout(reaperKickoff);
  await ocrWorker.close();
  await reaperQueue.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
