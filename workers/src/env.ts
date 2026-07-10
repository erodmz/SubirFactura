// Garantiza el entorno del worker aunque se lance fuera de ./scripts/dev.sh
// (p. ej. `pnpm dev:worker` en una terminal limpia). Carga el .env de la raíz
// del monorepo SIN pisar variables ya definidas en el shell. Sin esto, un
// worker lanzado sin entorno arranca "sano" pero revienta en el primer query
// (Prisma sin DATABASE_URL) y deja facturas atascadas — pasó en las pruebas.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotenvIfMissing(): void {
  if (process.env.DATABASE_URL) return; // el shell ya trae el entorno completo

  const candidates = [
    resolve(__dirname, '../../.env'), // workers/src (o dist) → raíz del monorepo
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../.env'),
  ];
  const envFile = candidates.find((p) => existsSync(p));
  if (!envFile) return;

  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (key === undefined || raw === undefined || process.env[key] !== undefined) continue;
    // Quita comillas envolventes si las hay (formato dotenv habitual)
    process.env[key] = raw.replace(/^(["'])(.*)\1$/, '$2');
  }
  console.log(`[env] variables cargadas de ${envFile}`);
}

loadDotenvIfMissing();
