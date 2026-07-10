'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { AreaChart, Donut, ESTADO_COLOR, HBars, SERIES } from '../../../components/Charts';
import {
  ESTADO_LABELS,
  type CierreEstado,
  type DashboardData,
  type LimitUsage,
  type OrgUsage,
  type PanelCierre,
  type PanelClienteCierre,
  type ResumenGastos,
} from '../../../lib/types';

function periodoActual(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const MESES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

function periodoLabel(p: string): string {
  const m = Number(p.slice(4, 6));
  return `${MESES[m - 1] ?? p.slice(4, 6)} ${p.slice(0, 4)}`;
}

function money(v: number): string {
  return v.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function moneyCompact(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
}

const SEMAFORO: Record<CierreEstado['semaforo'], string> = {
  verde: 'var(--ok)',
  amarillo: 'var(--m-orange)',
  rojo: 'var(--danger)',
  vacio: 'var(--muted)',
};

// Catálogo de widgets del dashboard (orden por defecto).
const WIDGETS: { id: string; label: string; span: 1 | 2 }[] = [
  { id: 'cierre', label: '606 del período', span: 2 },
  { id: 'kpis', label: 'KPIs del mes', span: 2 },
  { id: 'insights', label: 'Qué atender', span: 2 },
  { id: 'clientes', label: 'Clientes por atender', span: 2 },
  { id: 'estado', label: 'Facturas por estado', span: 1 },
  { id: 'tendencia', label: 'Monto reportado (12 meses)', span: 1 },
  { id: 'categoria', label: 'Gasto por categoría', span: 1 },
  { id: 'clienteChart', label: 'Facturas por cliente', span: 1 },
  { id: 'proveedores', label: 'Top proveedores', span: 1 },
  { id: 'actividad', label: 'Actividad (14 días)', span: 2 },
  { id: 'plan', label: 'Uso del plan', span: 2 },
];
const DEFAULT_ORDER = WIDGETS.map((w) => w.id);
const WIDGET = new Map(WIDGETS.map((w) => [w.id, w]));

function useDashConfig(orgId: string) {
  const key = `facturard-dash-${orgId}`;
  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER);
  const [hidden, setHidden] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const c = JSON.parse(raw) as { order?: string[]; hidden?: string[] };
        const known = new Set(DEFAULT_ORDER);
        const ord = (c.order ?? []).filter((id) => known.has(id));
        for (const id of DEFAULT_ORDER) if (!ord.includes(id)) ord.push(id);
        setOrder(ord);
        setHidden((c.hidden ?? []).filter((id) => known.has(id)));
      }
    } catch {
      /* localStorage no disponible */
    }
  }, [key]);

  function persist(ord: string[], hid: string[]) {
    setOrder(ord);
    setHidden(hid);
    try {
      localStorage.setItem(key, JSON.stringify({ order: ord, hidden: hid }));
    } catch {
      /* ignore */
    }
  }
  const toggle = (id: string) =>
    persist(order, hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id]);
  const move = (id: string, dir: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const ord = [...order];
    [ord[i], ord[j]] = [ord[j], ord[i]];
    persist(ord, hidden);
  };
  // Reordena por drag-and-drop: coloca `dragged` antes/después de `target`.
  const reorder = (dragged: string, target: string, after: boolean) => {
    if (dragged === target) return;
    const ord = order.filter((id) => id !== dragged);
    let ti = ord.indexOf(target);
    if (ti < 0) return;
    if (after) ti += 1;
    ord.splice(ti, 0, dragged);
    persist(ord, hidden);
  };
  const reset = () => persist(DEFAULT_ORDER, []);
  return { order, hidden, editing, setEditing, toggle, move, reorder, reset };
}

export default function OrgDashboard() {
  const { orgId } = useParams<{ orgId: string }>();
  const periodo = periodoActual();
  const [usage, setUsage] = useState<OrgUsage | null>(null);
  const [cierre, setCierre] = useState<CierreEstado | null>(null);
  const [resumen, setResumen] = useState<ResumenGastos | null>(null);
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [panel, setPanel] = useState<PanelCierre | null>(null);
  const [error, setError] = useState('');
  const cfg = useDashConfig(orgId);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  useEffect(() => {
    api<OrgUsage>(`/api/organizations/${orgId}/usage`)
      .then(setUsage)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));
    api<CierreEstado>(`/api/organizations/${orgId}/dgii/606/cierre?periodo=${periodo}`)
      .then(setCierre)
      .catch(() => {});
    api<ResumenGastos>(`/api/organizations/${orgId}/invoices/resumen?meses=6`)
      .then(setResumen)
      .catch(() => {});
    api<DashboardData>(`/api/organizations/${orgId}/invoices/dashboard`)
      .then(setDash)
      .catch(() => {});
    api<PanelCierre>(`/api/organizations/${orgId}/dgii/606/panel?periodo=${periodo}`)
      .then(setPanel)
      .catch(() => {});
  }, [orgId, periodo]);

  const invUrl = (estado: string) => `/orgs/${orgId}/invoices?estado=${estado}`;

  const clientesAtencion = useMemo(() => {
    if (!panel) return [];
    return panel.clientes.filter(necesitaAtencion).sort((a, b) => urgencia(b) - urgencia(a));
  }, [panel]);

  const insights = useMemo(
    () => (panel ? buildInsights(panel, dash, orgId) : []),
    [panel, dash, orgId],
  );

  // ── Render de cada widget (null = sin datos → no se muestra) ──────────────
  const renderers: Record<string, () => ReactNode> = {
    cierre: () =>
      cierre && (
        <div className="card" style={{ borderLeft: `4px solid ${SEMAFORO[cierre.semaforo]}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>606 de {periodoLabel(periodo)}</h2>
            {cierre.semaforo !== 'vacio' && (
              <span
                style={{
                  color:
                    cierre.vencido || cierre.diasRestantes <= 3 ? 'var(--danger)' : 'var(--muted)',
                }}
              >
                Vence {cierre.fechaLimite}
                {cierre.vencido
                  ? ` · venció hace ${Math.abs(cierre.diasRestantes)} día(s)`
                  : ` · faltan ${cierre.diasRestantes} día(s)`}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
            <Stat label="En revisión" value={cierre.totales.enRevision} href={invUrl('en_revision')} danger={cierre.totales.enRevision > 0} />
            <Stat label="Procesando" value={cierre.totales.enProceso} href={invUrl('procesando')} />
            <Stat label="Listas para el 606" value={cierre.totales.reportables} href={invUrl('validada')} ok={cierre.totales.reportables > 0} />
            {cierre.totales.sinAsignar > 0 && (
              <Stat label="Sin asignar" value={cierre.totales.sinAsignar} href={`/orgs/${orgId}/invoices`} danger />
            )}
            {cierre.totales.conAlertasDgii > 0 && (
              <Stat label="Con alertas DGII" value={cierre.totales.conAlertasDgii} danger />
            )}
          </div>
          <div style={{ marginTop: 14 }}>
            <Link href={`/orgs/${orgId}/dgii`}>Ir al cierre del 606 →</Link>
          </div>
        </div>
      ),
    kpis: () =>
      dash && (
        <div className="tiles">
          <Tile
            label="Subidas este mes"
            value={String(dash.kpis.subidasMes)}
            delta={pctDelta(dash.kpis.subidasMes, dash.kpisPrev.subidas)}
            record={
              dash.records.subidas && dash.records.subidas.periodo !== dash.periodo
                ? `récord ${dash.records.subidas.valor} · ${periodoLabel(dash.records.subidas.periodo)}`
                : dash.records.subidas
                  ? '¡nuevo récord! 🏆'
                  : undefined
            }
          />
          <Tile label="Listas para el 606" value={String(dash.kpis.reportablesMes)} accent="var(--ok)" />
          <Tile
            label="Monto reportado (mes)"
            value={`RD$ ${moneyCompact(dash.kpis.montoMes)}`}
            delta={pctDelta(dash.kpis.montoMes, dash.kpisPrev.monto)}
            record={
              dash.records.monto && dash.records.monto.periodo !== dash.periodo
                ? `récord RD$ ${moneyCompact(dash.records.monto.valor)} · ${periodoLabel(dash.records.monto.periodo)}`
                : undefined
            }
          />
          <Tile label="ITBIS del mes" value={`RD$ ${moneyCompact(dash.kpis.itbisMes)}`} />
        </div>
      ),
    insights: () =>
      insights.length > 0 && (
        <div className="card">
          <h2>Qué atender</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {insights.map((it, i) => (
              <InsightRow key={i} insight={it} />
            ))}
          </div>
        </div>
      ),
    clientes: () =>
      panel &&
      panel.clientes.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Clientes</h2>
            <span className="muted" style={{ fontSize: 13 }}>
              {clientesAtencion.length > 0 ? `${clientesAtencion.length} necesita(n) atención` : 'todo al día ✓'}
            </span>
          </div>
          <div className="attn">
            {(clientesAtencion.length > 0 ? clientesAtencion : panel.clientes).map((c) => (
              <ClienteRow key={c.clienteId} c={c} orgId={orgId} dash={dash} />
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <Link href={`/orgs/${orgId}/dgii`}>Ver panel de cierre completo →</Link>
          </div>
        </div>
      ),
    estado: () =>
      dash &&
      dash.total > 0 && (
        <div className="card">
          <h2>Facturas por estado</h2>
          <Donut
            centerLabel="facturas"
            data={[...dash.porEstado]
              .sort((a, b) => b.n - a.n)
              .map((e) => ({
                label: ESTADO_LABELS[e.estado] ?? e.estado,
                value: e.n,
                color: ESTADO_COLOR[e.estado] ?? 'var(--muted)',
              }))}
          />
        </div>
      ),
    tendencia: () =>
      dash &&
      dash.total > 0 && (
        <div className="card">
          <h2>Monto reportado (12 meses)</h2>
          <AreaChart
            data={dash.tendencia.map((t) => ({ label: periodoLabel(t.periodo).slice(0, 3), value: t.monto }))}
            format={(v) => `RD$ ${moneyCompact(v)}`}
          />
        </div>
      ),
    categoria: () =>
      dash &&
      dash.categorias.length > 0 && (
        <div className="card">
          <h2>Gasto por categoría (606)</h2>
          <HBars
            format={(v) => `RD$ ${moneyCompact(v)}`}
            data={dash.categorias.slice(0, 8).map((c, i) => ({
              label: `${c.codigo} · ${c.nombre}`,
              value: c.monto,
              color: SERIES[i % SERIES.length],
            }))}
          />
        </div>
      ),
    clienteChart: () =>
      dash &&
      dash.clientes.length > 0 && (
        <div className="card">
          <h2>Facturas por cliente</h2>
          <HBars
            data={dash.clientes.slice(0, 8).map((c, i) => ({
              label: c.razonSocial,
              value: c.n,
              color: SERIES[i % SERIES.length],
            }))}
          />
        </div>
      ),
    proveedores: () =>
      resumen &&
      resumen.topProveedores.length > 0 && (
        <div className="card">
          <h2>Top proveedores</h2>
          <HBars
            format={(v) => `RD$ ${moneyCompact(v)}`}
            data={resumen.topProveedores.slice(0, 8).map((p, i) => ({
              label: p.razonSocial,
              value: p.total,
              color: SERIES[i % SERIES.length],
            }))}
          />
        </div>
      ),
    actividad: () =>
      dash &&
      dash.actividad.some((a) => a.n > 0) && (
        <div className="card">
          <h2>Actividad (últimos 14 días)</h2>
          <Sparkbars data={dash.actividad} />
        </div>
      ),
    plan: () =>
      usage && (
        <div className="card">
          <h2>Uso del plan</h2>
          <p style={{ margin: '0 0 12px' }}>
            Plan <strong>{usage.plan?.nombre ?? 'sin plan'}</strong>{' '}
            <span className="badge">{usage.estadoSuscripcion ?? 'inactiva'}</span>
          </p>
          <div className="usage-grid">
            <UsageCard title="Contadores" usage={usage.contadores} />
            <UsageCard title="Clientes" usage={usage.clientes} />
            <UsageCard title="Facturas este mes" usage={usage.facturasMes} />
          </div>
        </div>
      ),
  };

  const visibles = cfg.order.filter((id) => !cfg.hidden.includes(id));
  const ocultos = cfg.order.filter((id) => cfg.hidden.includes(id));

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: '8px 0 18px', flex: 1 }}>Resumen</h1>
        {cfg.editing && (
          <button className="secondary" onClick={cfg.reset} style={{ margin: 0 }}>
            Restablecer
          </button>
        )}
        <button
          className={cfg.editing ? undefined : 'secondary'}
          onClick={() => cfg.setEditing(!cfg.editing)}
          style={{ margin: 0 }}
        >
          {cfg.editing ? 'Listo' : '⚙ Personalizar'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {cfg.editing && ocultos.length > 0 && (
        <div className="card" style={{ padding: '12px 16px' }}>
          <span className="muted">Ocultos — toca para mostrar:</span>
          <div className="dash-hidden">
            {ocultos.map((id) => (
              <button key={id} className="dash-chip" onClick={() => cfg.toggle(id)}>
                + {WIDGET.get(id)?.label ?? id}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="dash-grid">
        {visibles.map((id) => {
          const node = renderers[id]?.() || null;
          if (!node && !cfg.editing) return null;
          const w = WIDGET.get(id);
          const cellClass = [
            w?.span === 2 ? 'span2' : '',
            cfg.editing ? 'wgt-cell' : '',
            dragId === id ? 'dragging' : '',
            overId === id ? 'drag-over' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div
              key={id}
              className={cellClass || undefined}
              draggable={cfg.editing}
              onDragStart={
                cfg.editing
                  ? (e) => {
                      setDragId(id);
                      e.dataTransfer.effectAllowed = 'move';
                    }
                  : undefined
              }
              onDragOver={
                cfg.editing
                  ? (e) => {
                      if (dragId && dragId !== id) {
                        e.preventDefault();
                        if (overId !== id) setOverId(id);
                      }
                    }
                  : undefined
              }
              onDragLeave={cfg.editing ? () => setOverId((o) => (o === id ? null : o)) : undefined}
              onDrop={
                cfg.editing
                  ? (e) => {
                      e.preventDefault();
                      if (dragId) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const after = e.clientY > rect.top + rect.height / 2;
                        cfg.reorder(dragId, id, after);
                      }
                      setDragId(null);
                      setOverId(null);
                    }
                  : undefined
              }
              onDragEnd={cfg.editing ? () => { setDragId(null); setOverId(null); } : undefined}
            >
              {cfg.editing && (
                <div className="wgt-bar">
                  <span className="wgt-grip" aria-hidden>
                    ⠿
                  </span>
                  <span className="wgt-label">{w?.label ?? id}</span>
                  <span className="muted" style={{ fontWeight: 400, marginRight: 4 }}>
                    arrastra o
                  </span>
                  <button className="wgt-btn" onClick={() => cfg.move(id, -1)} aria-label="Subir">
                    ↑
                  </button>
                  <button className="wgt-btn" onClick={() => cfg.move(id, 1)} aria-label="Bajar">
                    ↓
                  </button>
                  <button className="wgt-btn" onClick={() => cfg.toggle(id)} aria-label="Ocultar">
                    Ocultar
                  </button>
                </div>
              )}
              <div className={cfg.editing ? 'wgt-edit' : undefined}>
                {node ?? (
                  <div className="card">
                    <span className="muted">{w?.label} — sin datos aún</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Lógica de atención / insights ──────────────────────────────────────────

function pctDelta(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

function necesitaAtencion(c: PanelClienteCierre): boolean {
  return (
    c.totales.enRevision > 0 ||
    c.bloqueos.length > 0 ||
    c.totales.conAlertasDgii > 0 ||
    c.semaforo === 'rojo'
  );
}

function urgencia(c: PanelClienteCierre): number {
  const s = c.semaforo === 'rojo' ? 5 : c.semaforo === 'amarillo' ? 2 : 0;
  return (
    c.totales.enRevision * 3 +
    c.bloqueos.length * 4 +
    c.totales.conAlertasDgii * 2 +
    c.totales.sinDatos606 +
    s
  );
}

interface Insight {
  texto: ReactNode;
  relevancia: number;
  tono: 'danger' | 'warn' | 'info';
  href?: string;
}

function buildInsights(panel: PanelCierre, dash: DashboardData | null, orgId: string): Insight[] {
  const out: Insight[] = [];
  const dias = panel.diasRestantes;

  const pendientesCierre = panel.clientes.filter((c) => c.totales.enRevision > 0);
  if ((panel.vencido || dias <= 5) && pendientesCierre.length > 0) {
    const k = pendientesCierre.reduce((s, c) => s + c.totales.enRevision, 0);
    out.push({
      tono: 'danger',
      relevancia: 95,
      href: `/orgs/${orgId}/dgii`,
      texto: (
        <>
          El 606 {panel.vencido ? 'venció' : `vence en ${dias} día(s)`} y hay <strong>{k}</strong>{' '}
          factura(s) en revisión en {pendientesCierre.length} cliente(s).
        </>
      ),
    });
  }
  if (panel.sinAsignar > 0) {
    out.push({
      tono: 'warn',
      relevancia: 80,
      href: `/orgs/${orgId}/invoices`,
      texto: (
        <>
          <strong>{panel.sinAsignar}</strong> factura(s) sin asignar esperan clasificación.
        </>
      ),
    });
  }
  if (dash) {
    const hoy = new Date(`${dash.hoy}T00:00:00`).getTime();
    for (const c of panel.clientes) {
      const u = dash.ultimaSubidaPorCliente[c.clienteId];
      if (!u) continue;
      const d = Math.round((hoy - new Date(`${u}T00:00:00`).getTime()) / 86_400_000);
      if (d >= 21) {
        out.push({
          tono: 'warn',
          relevancia: 55 + Math.min(30, d),
          href: `/orgs/${orgId}/invoices?clientId=${c.clienteId}`,
          texto: (
            <>
              <strong>{c.razonSocial}</strong> lleva <strong>{d}</strong> días sin subir facturas.
            </>
          ),
        });
      }
    }
  }
  const dup = panel.clientes.reduce((s, c) => s + c.totales.duplicadas, 0);
  if (dup > 0) {
    out.push({
      tono: 'info',
      relevancia: 40,
      texto: (
        <>
          <strong>{dup}</strong> factura(s) duplicada(s) detectada(s) este período.
        </>
      ),
    });
  }
  if (dash?.records.subidas && dash.records.subidas.periodo !== dash.periodo) {
    const rec = dash.records.subidas;
    const faltan = rec.valor - dash.kpis.subidasMes;
    if (dash.kpis.subidasMes > 0 && faltan > 0 && faltan <= Math.max(3, rec.valor * 0.4)) {
      out.push({
        tono: 'info',
        relevancia: 30,
        texto: (
          <>
            Vas <strong>{dash.kpis.subidasMes}</strong> subidas este mes; te faltan{' '}
            <strong>{faltan}</strong> para tu récord ({rec.valor}).
          </>
        ),
      });
    }
  }
  return out.sort((a, b) => b.relevancia - a.relevancia).slice(0, 5);
}

// ── Componentes de presentación ────────────────────────────────────────────

function Tile({
  label,
  value,
  record,
  accent,
  delta,
}: {
  label: string;
  value: string;
  record?: string;
  accent?: string;
  delta?: number | null;
}) {
  return (
    <div className="card tile">
      <span className="muted" style={{ fontSize: 13 }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 26, color: accent ?? 'inherit' }}>{value}</strong>
        {delta != null && delta !== 0 && (
          <span style={{ fontSize: 13, fontWeight: 600, color: delta > 0 ? 'var(--ok)' : 'var(--danger)' }}>
            {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}%
          </span>
        )}
      </div>
      {record && (
        <span className="muted" style={{ fontSize: 12 }}>
          {record}
        </span>
      )}
    </div>
  );
}

function InsightRow({ insight }: { insight: Insight }) {
  const color =
    insight.tono === 'danger' ? 'var(--danger)' : insight.tono === 'warn' ? 'var(--m-orange)' : 'var(--brand)';
  const inner = (
    <div className="insight" style={{ borderLeft: `3px solid ${color}` }}>
      <span>{insight.texto}</span>
      {insight.href && <span className="insight-go">→</span>}
    </div>
  );
  return insight.href ? (
    <Link href={insight.href} style={{ textDecoration: 'none', color: 'inherit' }}>
      {inner}
    </Link>
  ) : (
    inner
  );
}

function ClienteRow({
  c,
  orgId,
  dash,
}: {
  c: PanelClienteCierre;
  orgId: string;
  dash: DashboardData | null;
}) {
  const u = dash?.ultimaSubidaPorCliente[c.clienteId];
  const diasSin =
    dash && u
      ? Math.round(
          (new Date(`${dash.hoy}T00:00:00`).getTime() - new Date(`${u}T00:00:00`).getTime()) /
            86_400_000,
        )
      : null;
  return (
    <Link
      href={`/orgs/${orgId}/invoices?clientId=${c.clienteId}`}
      className="attn-row"
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <span className="dot" style={{ background: SEMAFORO[c.semaforo] }} aria-hidden />
      <span className="attn-name">{c.razonSocial}</span>
      <span className="attn-chips">
        {c.totales.enRevision > 0 && <span className="chip-num danger">{c.totales.enRevision} en revisión</span>}
        {c.totales.reportables > 0 && <span className="chip-num ok">{c.totales.reportables} listas</span>}
        {c.totales.conAlertasDgii > 0 && <span className="chip-num danger">{c.totales.conAlertasDgii} alertas</span>}
        {c.totales.enRevision === 0 && c.totales.conAlertasDgii === 0 && c.bloqueos.length === 0 && (
          <span className="chip-num ok">al día</span>
        )}
        {diasSin != null && diasSin >= 21 && <span className="chip-num warn">{diasSin}d sin subir</span>}
      </span>
    </Link>
  );
}

function Sparkbars({ data }: { data: { dia: string; n: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 64, marginTop: 10 }}>
      {data.map((d) => (
        <div
          key={d.dia}
          title={`${d.dia}: ${d.n} subida(s)`}
          style={{
            flex: 1,
            height: `${Math.max(6, (d.n / max) * 100)}%`,
            background: d.n > 0 ? 'var(--brand)' : 'var(--border)',
            opacity: d.n > 0 ? 1 : 0.5,
            borderRadius: 4,
          }}
        />
      ))}
    </div>
  );
}

function UsageCard({ title, usage }: { title: string; usage: LimitUsage | null }) {
  if (!usage) return null;
  const pct = usage.max > 0 ? Math.min(100, Math.round((usage.used / usage.max) * 100)) : 0;
  return (
    <div>
      <span className="muted" style={{ fontSize: 13 }}>
        {title}
      </span>
      <div>
        <strong style={{ fontSize: 22 }}>
          {usage.used} <span className="muted">/ {usage.max}</span>
        </strong>
      </div>
      <div className="bar">
        <div className={usage.warning ? 'warn' : ''} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  href,
  ok,
  danger,
}: {
  label: string;
  value: number;
  href?: string;
  ok?: boolean;
  danger?: boolean;
}) {
  const color = danger && value > 0 ? 'var(--danger)' : ok && value > 0 ? 'var(--ok)' : 'inherit';
  const inner = (
    <>
      <strong style={{ fontSize: 22, color }}>{value}</strong>
      <span className="muted" style={{ fontSize: 13 }}>
        {label}
      </span>
    </>
  );
  const style: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 96,
    padding: '8px 12px',
    borderRadius: 8,
    background: 'var(--bg-soft)',
  };
  return href ? (
    <Link href={href} style={{ ...style, textDecoration: 'none' }}>
      {inner}
    </Link>
  ) : (
    <div style={style}>{inner}</div>
  );
}
