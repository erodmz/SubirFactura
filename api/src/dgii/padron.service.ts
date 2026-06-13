import { Injectable } from '@nestjs/common';
import { validateAgainstPadron, type PadronEntry, type PadronValidation } from '@facturard/shared';
import { PrismaService } from '../prisma/prisma.service';

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
}
