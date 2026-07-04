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
  let bitmap: { data: Buffer; width: number; height: number };
  try {
    const image = await Jimp.read(buffer);
    bitmap = image.bitmap;
  } catch {
    return null; // formato no soportado (p.ej. webp) o imagen corrupta
  }
  const code = jsQR(
    new Uint8ClampedArray(bitmap.data.buffer, bitmap.data.byteOffset, bitmap.data.byteLength),
    bitmap.width,
    bitmap.height,
  );
  return code?.data ?? null;
}
