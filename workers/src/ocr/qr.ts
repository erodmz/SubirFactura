// Decodifica el código QR de las facturas e-CF y, si es de la DGII, extrae los
// datos oficiales embebidos en la URL (Fase 3, §4). Es lo único que la visión de
// Claude no lee de forma fiable, así que usamos un decodificador dedicado.

import { Jimp } from 'jimp';
import jsQR from 'jsqr';
import { parseEcfQrUrl, type EcfQrData } from '@facturard/shared';

export type { EcfQrData };

/** Busca un QR de e-CF en las imágenes (base64) y devuelve sus datos, o null. */
export async function decodeEcfQr(images: { data: string }[]): Promise<EcfQrData | null> {
  for (const img of images) {
    const raw = await readQrText(Buffer.from(img.data, 'base64'));
    if (!raw) continue;
    const parsed = parseEcfQrUrl(raw);
    if (parsed) return parsed;
  }
  return null;
}

async function readQrText(buffer: Buffer): Promise<string | null> {
  let image;
  try {
    image = await Jimp.read(buffer);
  } catch {
    return null; // formato no soportado (p.ej. webp) o imagen corrupta
  }

  // jsQR falla con fotos enormes (el QR queda diminuto en el frame) o con el
  // comprobante girado. Escaneamos una versión REDUCIDA (más rápida y más
  // legible para jsQR) en las 4 orientaciones y devolvemos el primer QR válido.
  const maxSide = Math.max(image.bitmap.width, image.bitmap.height);
  const base = maxSide > 1800 ? image.clone().scale(1800 / maxSide) : image;

  const scan = (bmp: { data: Buffer; width: number; height: number }) =>
    jsQR(
      new Uint8ClampedArray(bmp.data.buffer, bmp.data.byteOffset, bmp.data.byteLength),
      bmp.width,
      bmp.height,
    )?.data ?? null;

  for (const deg of [0, 90, 180, 270]) {
    const candidate = deg === 0 ? base : base.clone().rotate(deg);
    const text = scan(candidate.bitmap);
    if (text) return text;
  }
  return null;
}
