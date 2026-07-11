import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { rasterizePdf } from './pdf';

/** ¿Está poppler disponible? Si no, la rasterización no aplica en este entorno. */
function popplerDisponible(): boolean {
  try {
    execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Construye un PDF mínimo válido con `pages` páginas de texto simple. */
function makePdf(textos: string[]): Buffer {
  const obj = (n: number, body: string) => `${n} 0 obj\n${body}\nendobj\n`;
  const contentStream = (text: string) => {
    const content = `BT /F1 14 Tf 60 760 Td (${text}) Tj ET`;
    return `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  };
  const objs: string[] = [];
  const pageObjNums = textos.map((_, i) => 3 + i * 2);
  const kids = pageObjNums.map((n) => `${n} 0 R`).join(' ');
  objs.push(obj(1, '<< /Type /Catalog /Pages 2 0 R >>'));
  objs.push(obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${textos.length} >>`));
  textos.forEach((t, i) => {
    const pageNum = 3 + i * 2;
    const contentNum = pageNum + 1;
    objs.push(
      obj(
        pageNum,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 100 0 R >> >> /Contents ${contentNum} 0 R >>`,
      ),
    );
    objs.push(obj(contentNum, contentStream(t)));
  });
  objs.push(obj(100, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));

  let pdf = '%PDF-1.4\n';
  for (const o of objs) pdf += o;
  pdf += 'trailer\n<< /Root 1 0 R >>\n%%EOF';
  return Buffer.from(pdf, 'latin1');
}

const JPEG_MAGIC = [0xff, 0xd8, 0xff];

describe.skipIf(!popplerDisponible())('rasterizePdf', () => {
  it('convierte cada página en una imagen JPEG, en orden', async () => {
    const pages = await rasterizePdf(makePdf(['Pagina uno', 'Pagina dos', 'Pagina tres']));
    expect(pages).toHaveLength(3);
    for (const p of pages) {
      expect([p[0], p[1], p[2]]).toEqual(JPEG_MAGIC); // cabecera JPEG
    }
    // Páginas distintas: contenidos distintos ⇒ bytes distintos.
    expect(pages[0]!.equals(pages[1]!)).toBe(false);
  });

  it('lanza si el PDF está dañado', async () => {
    await expect(rasterizePdf(Buffer.from('%PDF-1.4 basura no-pdf'))).rejects.toThrow();
  });
});
