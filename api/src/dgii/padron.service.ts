import { Injectable } from '@nestjs/common';
import {
  consultarRncLive,
  validateAgainstPadron,
  validateTaxId,
  type PadronEntry,
  type PadronValidation,
} from '@facturard/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface RncLookup {
  rnc: string;
  /** ¿Es un identificador estructuralmente válido (dígito verificador)? */
  valido: boolean;
  kind: 'rnc' | 'cedula' | null;
  /** Nombre legal según la DGII/padrón; null si no se encontró. */
  razonSocial: string | null;
  estado: string | null;
  /** true si el estado indica actividad normal. */
  activo: boolean;
  /** true si la DGII lo reconoce (o el padrón lo tiene). */
  encontrado: boolean;
  fuente: 'dgii' | 'padron' | 'ninguna';
}

/**
 * Validación contra el Padrón RNC de la DGII. La tabla rnc_padron es global
 * (no por tenant); se carga con scripts/import-padron-rnc.ts. Si está vacía,
 * la validación se considera inactiva y no bloquea nada.
 */
@Injectable()
export class PadronService {
  constructor(private readonly prisma: PrismaService) {}

  async status(): Promise<{ count: number; updatedAt: Date | null }> {
    const [count, latest] = await Promise.all([
      this.prisma.rncPadron.count(),
      this.prisma.rncPadron.findFirst({
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ]);
    return { count, updatedAt: latest?.updatedAt ?? null };
  }

  /** Mapa rnc → entrada para validar muchos RNC con una sola consulta. */
  async getEntries(rncs: string[]): Promise<Map<string, PadronEntry>> {
    if (rncs.length === 0) return new Map();
    const rows = await this.prisma.rncPadron.findMany({
      where: { rnc: { in: [...new Set(rncs)] } },
      select: { rnc: true, razonSocial: true, estado: true },
    });
    return new Map(rows.map((r) => [r.rnc, r]));
  }

  async validateOne(rnc: string, razonSocial: string | null): Promise<PadronValidation> {
    const entry = (await this.getEntries([rnc])).get(rnc) ?? null;
    return validateAgainstPadron(rnc, razonSocial, entry);
  }

  /** Valida una lista; devuelve solo las que tienen algún problema. */
  async findProblems(
    items: { rnc: string; razonSocial: string | null }[],
  ): Promise<PadronValidation[]> {
    if (items.length === 0) return [];
    const entries = await this.getEntries(items.map((i) => i.rnc));
    const problems: PadronValidation[] = [];
    for (const item of items) {
      const v = validateAgainstPadron(item.rnc, item.razonSocial, entries.get(item.rnc) ?? null);
      if (!v.existe || !v.activo || !v.razonSocialCoincide) problems.push(v);
    }
    return problems;
  }

  // Caché en memoria del lookup de RNC: el autocompletar al crear cliente puede
  // dispararse varias veces por el mismo RNC mientras se teclea; no repetir la
  // consulta a la DGII. TTL corto: la razón social casi nunca cambia.
  private readonly lookupCache = new Map<string, { at: number; value: RncLookup }>();
  private static readonly LOOKUP_TTL_MS = 10 * 60 * 1000;

  /**
   * Resuelve un RNC/cédula para autocompletar: valida el dígito verificador,
   * consulta la DGII en vivo (fuente primaria) y cae al padrón local. Nunca
   * lanza: ante cualquier fallo devuelve "no encontrado" para no romper el form.
   */
  async lookupRnc(raw: string): Promise<RncLookup> {
    const tax = validateTaxId(raw);
    const rnc = tax.normalized ?? raw.replace(/\D/g, '');
    const base: RncLookup = {
      rnc,
      valido: tax.valid,
      kind: tax.kind ?? null,
      razonSocial: null,
      estado: null,
      activo: false,
      encontrado: false,
      fuente: 'ninguna',
    };
    if (!tax.valid) return base;

    const cached = this.lookupCache.get(rnc);
    if (cached && Date.now() - cached.at < PadronService.LOOKUP_TTL_MS) return cached.value;

    let result = base;
    try {
      const liveEnabled = process.env.DGII_LIVE_CONSULTA !== '0';
      const timeout = Number(process.env.DGII_CONSULTA_TIMEOUT_MS ?? 5000);
      const live = liveEnabled ? await consultarRncLive(rnc, timeout) : null;
      if (live?.encontrado) {
        result = {
          ...base,
          razonSocial: live.razonSocial,
          estado: live.estado,
          activo: live.activo,
          encontrado: true,
          fuente: 'dgii',
        };
      } else {
        const entry = (await this.getEntries([rnc])).get(rnc) ?? null;
        if (entry) {
          result = {
            ...base,
            razonSocial: entry.razonSocial,
            estado: entry.estado ?? null,
            activo: !entry.estado || /^(activo|normal)$/i.test(entry.estado),
            encontrado: true,
            fuente: 'padron',
          };
        }
      }
    } catch {
      result = base; // degradación elegante: el usuario escribe el nombre a mano
    }

    this.lookupCache.set(rnc, { at: Date.now(), value: result });
    return result;
  }
}
