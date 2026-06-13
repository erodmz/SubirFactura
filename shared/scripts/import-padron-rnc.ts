// Importador del Padrón RNC de la DGII (ESPECIFICACION.md §6).
//
// La DGII publica el padrón completo como archivo de texto separado por pipe (|)
// dentro de RNC_CONTRIBUYENTES.zip (descargable desde dgii.gov.do). Este script
// lo carga en la tabla rnc_padron para validación local. Pensado para correr
// semanalmente (cron).
//
// Uso:
//   pnpm --filter @facturard/shared exec tsx scripts/import-padron-rnc.ts <ruta-al-TXT>
//
// El layout puede variar entre versiones; los índices de columna son ajustables
// por env (COL_RNC, COL_RAZON, COL_COMERCIAL, COL_ACTIVIDAD, COL_ESTADO).
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const file = process.argv[2];
if (!file) {
  console.error('Uso: tsx scripts/import-padron-rnc.ts <ruta-al-archivo-TXT>');
  process.exit(1);
}

const COL = {
  rnc: Number(process.env.COL_RNC ?? 0),
  razon: Number(process.env.COL_RAZON ?? 1),
  comercial: Number(process.env.COL_COMERCIAL ?? 2),
  actividad: Number(process.env.COL_ACTIVIDAD ?? 3),
  estado: Number(process.env.COL_ESTADO ?? 9),
};
const BATCH = 2000;

type Row = {
  rnc: string;
  razonSocial: string;
  nombreComercial: string | null;
  actividad: string | null;
  estado: string | null;
};

function clean(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

async function insertBatch(rows: Row[]) {
  if (rows.length === 0) return;
  await prisma.rncPadron.createMany({ data: rows, skipDuplicates: true });
}

async function main() {
  console.log(`Importando padrón desde ${file} …`);
  // Las normas se publican normalmente en latin1; lo normalizamos al comparar.
  const rl = createInterface({
    input: createReadStream(file, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });

  // Refresco completo: el padrón se reemplaza cada semana.
  await prisma.rncPadron.deleteMany();

  let batch: Row[] = [];
  let total = 0;
  let descartadas = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = line.split('|');
    const rnc = clean(cols[COL.rnc])?.replace(/[-\s]/g, '') ?? '';
    const razonSocial = clean(cols[COL.razon]);
    // Solo RNC (9) o cédula (11) con razón social
    if (!/^\d{9}$|^\d{11}$/.test(rnc) || !razonSocial) {
      descartadas++;
      continue;
    }
    batch.push({
      rnc,
      razonSocial,
      nombreComercial: clean(cols[COL.comercial]),
      actividad: clean(cols[COL.actividad]),
      estado: clean(cols[COL.estado]),
    });
    if (batch.length >= BATCH) {
      await insertBatch(batch);
      total += batch.length;
      batch = [];
      if (total % 50000 === 0) console.log(`  ${total} registros…`);
    }
  }
  await insertBatch(batch);
  total += batch.length;

  console.log(`Padrón importado: ${total} registros (${descartadas} líneas descartadas).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
