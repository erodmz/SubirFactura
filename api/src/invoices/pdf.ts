// Rasterización de PDF a imágenes de página con poppler (pdfinfo + pdftoppm).
// Los PDFs se convierten AL SUBIR, no en el worker: así entran al mismo pipeline
// multi-imagen que las fotos (almacenamiento por página, proxy /image, revisión
// como <img>, hash de duplicados) sin tocar nada aguas abajo.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileP = promisify(execFile);

/** Tope de páginas a rasterizar (un PDF enorme no debe tumbar la subida). */
const PDF_MAX_PAGES = Number(process.env.PDF_MAX_PAGES ?? 10);
/** Resolución de rasterización; 150 dpi basta para OCR de facturas. */
const PDF_DPI = Number(process.env.PDF_RASTER_DPI ?? 150);
/** Tope de tiempo por comando poppler: un PDF malicioso (vectores costosos o
 *  página enorme) no puede colgar poppler indefinidamente y agotar la CPU.
 *  La rasterización corre dentro del request de subida, así que hay que acotarla. */
const PDF_TIMEOUT_MS = Number(process.env.PDF_TIMEOUT_MS ?? 20_000);
/** Límite de píxeles por lado: pdftoppm -scale-to-x/-y contra páginas gigantes. */
const PDF_MAX_PX = Number(process.env.PDF_MAX_PX ?? 2500);
const EXEC_OPTS = { timeout: PDF_TIMEOUT_MS, killSignal: 'SIGKILL' as const, maxBuffer: 64 * 1024 * 1024 };

/**
 * Convierte un PDF en una lista de imágenes JPEG (una por página, hasta el tope).
 * Lanza si el PDF no se puede convertir. Best-effort en el conteo de páginas: si
 * pdfinfo falla, se rasteriza hasta el tope por defecto.
 */
export async function rasterizePdf(pdf: Buffer): Promise<Buffer[]> {
  const dir = await mkdtemp(join(tmpdir(), 'sf-pdf-'));
  try {
    const input = join(dir, 'in.pdf');
    await writeFile(input, pdf);

    let lastPage = PDF_MAX_PAGES;
    try {
      const { stdout } = await execFileP('pdfinfo', [input], EXEC_OPTS);
      const m = stdout.match(/Pages:\s+(\d+)/);
      if (m) lastPage = Math.min(Number(m[1]), PDF_MAX_PAGES);
    } catch {
      // pdfinfo no disponible o PDF sin metadatos: seguimos con el tope.
    }

    await execFileP(
      'pdftoppm',
      [
        '-jpeg',
        '-r',
        String(PDF_DPI),
        '-l',
        String(lastPage),
        // Acota el tamaño de salida: una página con MediaBox gigante no puede
        // generar un bitmap de cientos de megapíxeles.
        '-scale-to-x',
        String(PDF_MAX_PX),
        '-scale-to-y',
        '-1',
        input,
        join(dir, 'page'),
      ],
      EXEC_OPTS,
    );

    // pdftoppm genera page-1.jpg, page-2.jpg… (o con ceros si hay ≥10 páginas).
    // Ordenamos por el número de página, no alfabéticamente, para no poner la
    // página 10 antes que la 2.
    const names = (await readdir(dir))
      .filter((n) => /^page-\d+\.jpg$/.test(n))
      .sort((a, b) => pageNum(a) - pageNum(b));

    const pages: Buffer[] = [];
    for (const n of names) pages.push(await readFile(join(dir, n)));
    if (pages.length === 0) {
      throw new Error('El PDF no produjo ninguna página');
    }
    return pages;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function pageNum(filename: string): number {
  const m = filename.match(/page-(\d+)\.jpg$/);
  return m ? Number(m[1]) : 0;
}
