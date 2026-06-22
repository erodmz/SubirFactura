// Extracción de datos fiscales con Claude API (visión) — ESPECIFICACION.md §5.2.
// Structured outputs garantizan JSON válido contra el esquema; el SDK reintenta
// 429/5xx automáticamente y BullMQ aporta los reintentos con backoff (§5.5).

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { CATEGORIAS_606, type InvoiceExtraction } from '@facturard/shared';

const client = new Anthropic();

const campo = <T extends z.ZodType>(valor: T) =>
  z.object({
    valor: valor.nullable(),
    confianza: z.number(),
  });

const ExtractionSchema = z.object({
  ncf: campo(z.string()),
  rnc_proveedor: campo(z.string()),
  razon_social: campo(z.string()),
  fecha: campo(z.string()),
  monto_facturado: campo(z.number()),
  itbis: campo(z.number()),
  propina_legal: campo(z.number()),
  monto_total: campo(z.number()),
  categoria_606_sugerida: campo(z.string()),
  tipo_comprobante: campo(z.string()),
  es_legible: z.boolean(),
  notas: z.string(),
});

const CATEGORIAS = CATEGORIAS_606.map((c) => `${c.codigo} = ${c.nombre}`).join('\n');

const PROMPT = `Eres un extractor de datos fiscales de República Dominicana. Analiza la foto de esta factura de gasto y extrae los campos solicitados.

Reglas:
- NCF: comprobante fiscal (serie B + 2 dígitos de tipo + 8 secuenciales, p.ej. B0100000123; o e-CF serie E de 13 caracteres). Transcríbelo EXACTAMENTE como aparece.
- rnc_proveedor: RNC (9 dígitos) o cédula (11 dígitos) del PROVEEDOR que emite la factura, no del comprador.
- fecha: fecha de emisión en formato AAAA-MM-DD.
- monto_facturado: subtotal SIN impuestos. itbis: el ITBIS (18%). propina_legal: propina del 10% si aparece. monto_total: el total final impreso.
- tipo_comprobante: los 2 dígitos de tipo del NCF (p.ej. "01" para crédito fiscal).
- categoria_606_sugerida: la categoría de gasto del Formato 606 que mejor aplique:
${CATEGORIAS}
- confianza: tu certeza real de 0 a 1 por campo. Sé honesto: si un dígito es dudoso, baja la confianza. Usa valor null cuando el campo no aparezca o no se distinga.
- es_legible: false si la foto está demasiado borrosa, cortada u oscura para extraer los campos críticos.
- notas: observaciones breves (p.ej. "factura térmica desvanecida").

Si recibes VARIAS imágenes, son páginas/secciones de UN MISMO comprobante (un recibo largo fotografiado por partes, en orden). Combínalas en una sola extracción: el NCF/RNC suelen estar en la primera y el total al final.`;

export interface ImageInput {
  data: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export async function extractInvoice(images: ImageInput[]): Promise<InvoiceExtraction> {
  const response = await client.messages.parse({
    // El modelo SIEMPRE viene de env (§5): nunca hardcodear
    model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          ...images.map(
            (img) =>
              ({
                type: 'image',
                source: { type: 'base64', media_type: img.mediaType, data: img.data },
              }) as const,
          ),
          { type: 'text', text: PROMPT },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ExtractionSchema) },
  });

  if (!response.parsed_output) {
    throw new Error(`La extracción no devolvió JSON válido (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}
