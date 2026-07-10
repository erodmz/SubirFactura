'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { useAutoRefresh } from '../../../lib/useAutoRefresh';
import { AreaChart, Donut, ESTADO_COLOR, HBars, SERIES } from '../../../components/Charts';
import Dropdown, { type DropdownOption } from '../../../components/Dropdown';
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

// Catálogo de widgets del dashboard (orden y ancho por defecto en columnas 1–4).
const WIDGETS: { id: string; label: string; size: number }[] = [
  { id: 'cierre', label: '606 del período', size: 4 },
  { id: 'kpis', label: 'KPIs del mes', size: 4 },
  { id: 'insights', label: 'Qué atender', size: 4 },
  { id: 'clientes', label: 'Clientes por atender', size: 4 },
  { id: 'estado', label: 'Facturas por estado', size: 2 },
  { id: 'tendencia', label: 'Monto reportado (12 meses)', size: 2 },
  { id: 'categoria', label: 'Gasto por categoría', size: 2 },
  { id: 'clienteChart', label: 'Facturas por cliente', size: 2 },
  { id: 'proveedores', label: 'Top proveedores', size: 2 },
  { id: 'actividad', label: 'Actividad (14 días)', size: 4 },
  { id: 'plan', label: 'Uso del plan', size: 4 },
];
const DEFAULT_ORDER = WIDGETS.map((w) => w.id);
const WIDGET = new Map(WIDGETS.map((w) => [w.id, w]));

// Configuración por defecto del dashboard (la que ve todo el mundo y a la que
// vuelve "Restablecer"). sizes vacío = usa el ancho por defecto de cada widget.
const DEFAULT_CONFIG: DashCfg = {
  order: DEFAULT_ORDER,
  hidden: [],
  sizes: {},
  heights: {},
};
const cloneDefault = (): DashCfg => ({
  order: [...DEFAULT_CONFIG.order],
  hidden: [...DEFAULT_CONFIG.hidden],
  sizes: { ...DEFAULT_CONFIG.sizes },
  heights: { ...DEFAULT_CONFIG.heights },
});

interface DashCfg {
  order: string[];
  hidden: string[];
  sizes: Record<string, number>;
  heights: Record<string, number>;
}

function useDashConfig(orgId: string) {
  const key = `facturard-dash-${orgId}`;
  const [order, setOrder] = useState<string[]>(DEFAULT_CONFIG.order);
  const [hidden, setHidden] = useState<string[]>(DEFAULT_CONFIG.hidden);
  const [sizes, setSizes] = useState<Record<string, number>>(DEFAULT_CONFIG.sizes);
  const [heights, setHeights] = useState<Record<string, number>>(DEFAULT_CONFIG.heights);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const c = JSON.parse(raw) as Partial<DashCfg>;
        const known = new Set(DEFAULT_ORDER);
        const ord = (c.order ?? []).filter((id) => known.has(id));
        for (const id of DEFAULT_ORDER) if (!ord.includes(id)) ord.push(id);
        setOrder(ord);
        setHidden((c.hidden ?? DEFAULT_CONFIG.hidden).filter((id) => known.has(id)));
        setSizes(c.sizes ?? DEFAULT_CONFIG.sizes);
        setHeights(c.heights ?? DEFAULT_CONFIG.heights);
      }
    } catch {
      /* localStorage no disponible */
    }
  }, [key]);

  function persist(patch: Partial<DashCfg>) {
    const next: DashCfg = { order, hidden, sizes, heights, ...patch };
    setOrder(next.order);
    setHidden(next.hidden);
    setSizes(next.sizes);
    setHeights(next.heights);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  const toggle = (id: string) =>
    persist({ hidden: hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id] });
  const move = (id: string, dir: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const ord = [...order];
    [ord[i], ord[j]] = [ord[j], ord[i]];
    persist({ order: ord });
  };
  const reorder = (dragged: string, target: string, after: boolean) => {
    if (dragged === target) return;
    const ord = order.filter((id) => id !== dragged);
    let ti = ord.indexOf(target);
    if (ti < 0) return;
    if (after) ti += 1;
    ord.splice(ti, 0, dragged);
    persist({ order: ord });
  };
  const sizeOf = (id: string) => sizes[id] ?? WIDGET.get(id)?.size ?? 2;
  const heightOf = (id: string) => heights[id];
  const resize = (id: string, dir: -1 | 1) =>
    persist({ sizes: { ...sizes, [id]: Math.min(4, Math.max(1, sizeOf(id) + dir)) } });
  // Redimensiona ancho (columnas) y alto (px) a la vez (drag del mouse).
  const setBox = (id: string, cols: number, h: number | null) =>
    persist({
      sizes: { ...sizes, [id]: cols },
      heights:
        h == null ? Object.fromEntries(Object.entries(heights).filter(([k]) => k !== id)) : { ...heights, [id]: h },
    });
  const reset = () => persist(cloneDefault());
  return {
    order, hidden, sizes, heights, editing, setEditing,
    toggle, move, reorder, sizeOf, heightOf, resize, setBox, reset,
  };
}

// Últimos 12 períodos (AAAAMM) hasta el mes actual, para el filtro de período.
function periodosRecientes(): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export default function OrgDashboard() {
  const { orgId } = useParams<{ orgId: string }>();
  const [fPeriodo, setFPeriodo] = useState(periodoActual());
  const [fCliente, setFCliente] = useState('');
  const [clientes, setClientes] = useState<{ id: string; razonSocial: string }[]>([]);
  const [usage, setUsage] = useState<OrgUsage | null>(null);
  const [cierre, setCierre] = useState<CierreEstado | null>(null);
  const [resumen, setResumen] = useState<ResumenGastos | null>(null);
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [panel, setPanel] = useState<PanelCierre | null>(null);
  const [error, setError] = useState('');
  const cfg = useDashConfig(orgId);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Redimensiona un widget arrastrando su esquina (ancho en columnas + alto en px).
  function startResize(e: React.PointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    const grid = gridRef.current;
    const cell = (e.currentTarget as HTMLElement).closest('.wgt-cell') as HTMLElement | null;
    if (!grid || !cell) return;
    const gap = 16;
    const unit = (grid.clientWidth - 3 * gap) / 4 + gap; // ancho de 1 columna + gap
    const startX = e.clientX;
    const startY = e.clientY;
    const startCols = cfg.sizeOf(id);
    const startW = cell.offsetWidth;
    const startH = cfg.heightOf(id) ?? cell.offsetHeight;
    let raf = 0;
    const onMove = (ev: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const cols = Math.min(4, Math.max(1, Math.round((startW + (ev.clientX - startX) + gap) / unit)));
        const h = Math.min(1000, Math.max(150, startH + (ev.clientY - startY)));
        cfg.setBox(id, cols, h);
      });
    };
    const onUp = () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    void startCols;
  }

  // Lista de clientes para el filtro (una vez por org).
  useEffect(() => {
    api<{ id: string; razonSocial: string }[]>(`/api/organizations/${orgId}/clients`)
      .then(setClientes)
      .catch(() => {});
  }, [orgId]);

  // Datos del dashboard, re-consultados al cambiar período o cliente.
  const refetch = useCallback(() => {
    const cl = fCliente ? `&clientProfileId=${fCliente}` : '';
    const clId = fCliente ? `&clientId=${fCliente}` : '';
    api<OrgUsage>(`/api/organizations/${orgId}/usage`)
      .then(setUsage)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));
    api<CierreEstado>(`/api/organizations/${orgId}/dgii/606/cierre?periodo=${fPeriodo}${clId}`)
      .then(setCierre)
      .catch(() => {});
    api<ResumenGastos>(`/api/organizations/${orgId}/invoices/resumen?meses=6${cl}`)
      .then(setResumen)
      .catch(() => {});
    api<DashboardData>(`/api/organizations/${orgId}/invoices/dashboard?periodo=${fPeriodo}${cl}`)
      .then(setDash)
      .catch(() => {});
    api<PanelCierre>(`/api/organizations/${orgId}/dgii/606/panel?periodo=${fPeriodo}`)
      .then(setPanel)
      .catch(() => {});
  }, [orgId, fPeriodo, fCliente]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Auto-sincroniza al volver a la pestaña y con polling suave.
  useAutoRefresh(refetch);

  const periodo = fPeriodo;
  const clienteQ = fCliente ? `&clientId=${fCliente}` : '';
  const invUrl = (estado: string) => `/orgs/${orgId}/invoices?estado=${estado}${clienteQ}`;

  // Panel filtrado por el cliente seleccionado (el panel viene con todos).
  const panelClientes = useMemo(
    () => (panel ? (fCliente ? panel.clientes.filter((c) => c.clienteId === fCliente) : panel.clientes) : []),
    [panel, fCliente],
  );

  const clientesAtencion = useMemo(
    () => panelClientes.filter(necesitaAtencion).sort((a, b) => urgencia(b) - urgencia(a)),
    [panelClientes],
  );

  const insights = useMemo(
    () => (panel ? buildInsights({ ...panel, clientes: panelClientes }, dash, orgId, clienteQ) : []),
    [panel, panelClientes, dash, orgId, clienteQ],
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
      panelClientes.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Clientes</h2>
            <span className="muted" style={{ fontSize: 13 }}>
              {clientesAtencion.length > 0 ? `${clientesAtencion.length} necesita(n) atención` : 'todo al día ✓'}
            </span>
          </div>
          <div className="attn">
            {(clientesAtencion.length > 0 ? clientesAtencion : panelClientes).map((c) => (
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

      {/* Filtros: período fiscal y cliente. */}
      <div className="dash-filters">
        <Dropdown
          ariaLabel="Período fiscal"
          icon={<span aria-hidden>📅</span>}
          value={fPeriodo}
          onChange={setFPeriodo}
          options={periodosRecientes().map((p, i) => ({
            value: p,
            label: i === 0 ? `Este mes · ${periodoLabel(p)}` : periodoLabel(p),
          }))}
        />
        <Dropdown
          ariaLabel="Cliente"
          icon={<span aria-hidden>🏢</span>}
          value={fCliente}
          onChange={setFCliente}
          options={
            [
              { value: '', label: 'Todos los clientes' },
              ...clientes.map((c) => ({ value: c.id, label: c.razonSocial })),
            ] as DropdownOption[]
          }
        />
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

      <div className="dash-grid" ref={gridRef}>
        {visibles.map((id) => {
          const node = renderers[id]?.() || null;
          if (!node && !cfg.editing) return null;
          const w = WIDGET.get(id);
          const h = cfg.heightOf(id);
          const cellClass = [
            `size-${cfg.sizeOf(id)}`,
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
            >
              {cfg.editing && (
                <div className="wgt-bar">
                  <span
                    className="wgt-grip"
                    title="Arrastra para reordenar"
                    draggable
                    onDragStart={(e) => {
                      setDragId(id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                    }}
                  >
                    ⠿
                  </span>
                  <span className="wgt-label">{w?.label ?? id}</span>
                  <button className="wgt-btn" onClick={() => cfg.resize(id, -1)} disabled={cfg.sizeOf(id) <= 1} aria-label="Más angosto" title="Más angosto">
                    ⇤
                  </button>
                  <span className="muted" style={{ fontVariantNumeric: 'tabular-nums', minWidth: 24, textAlign: 'center' }}>
                    {cfg.sizeOf(id)}/4
                  </span>
                  <button className="wgt-btn" onClick={() => cfg.resize(id, 1)} disabled={cfg.sizeOf(id) >= 4} aria-label="Más ancho" title="Más ancho">
                    ⇥
                  </button>
                  {h != null && (
                    <button className="wgt-btn" onClick={() => cfg.setBox(id, cfg.sizeOf(id), null)} title="Altura automática">
                      alto auto
                    </button>
                  )}
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
              <div
                className={[cfg.editing ? 'wgt-edit' : '', h != null ? 'wgt-fixed' : ''].filter(Boolean).join(' ') || undefined}
                style={h != null ? { height: h } : undefined}
              >
                {node ?? (
                  <div className="card">
                    <span className="muted">{w?.label} — sin datos aún</span>
                  </div>
                )}
              </div>
              {cfg.editing && (
                <span
                  className="wgt-resize"
                  title="Arrastra para redimensionar"
                  onPointerDown={(e) => startResize(e, id)}
                />
              )}
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

function buildInsights(
  panel: PanelCierre,
  dash: DashboardData | null,
  orgId: string,
  clienteQ: string,
): Insight[] {
  const out: Insight[] = [];
  const dias = panel.diasRestantes;
  const inv = (estado?: string) =>
    `/orgs/${orgId}/invoices${estado ? `?estado=${estado}` : '?'}${clienteQ}`;
  const conteo = (estado: string) => dash?.porEstado.find((e) => e.estado === estado)?.n ?? 0;

  // Vencimiento del 606 del período.
  if (panel.vencido || dias <= 5) {
    out.push({
      tono: panel.vencido ? 'danger' : 'warn',
      relevancia: 96,
      href: `/orgs/${orgId}/dgii`,
      texto: (
        <>
          El 606 {panel.vencido ? `venció hace ${Math.abs(dias)} día(s)` : `vence en ${dias} día(s)`}.
        </>
      ),
    });
  }
  // Facturas en revisión: hay que corregir y validar.
  const enRev = conteo('en_revision');
  if (enRev > 0) {
    out.push({
      tono: 'danger',
      relevancia: 90,
      href: inv('en_revision'),
      texto: (
        <>
          <strong>{enRev}</strong> factura(s) <strong>en revisión</strong> — corrígelas y valídalas.
        </>
      ),
    });
  }
  // Alertas DGII (NCF/RNC/padrón): revisar antes de reportar.
  const alertas = panel.clientes.reduce((s, c) => s + c.totales.conAlertasDgii, 0);
  if (alertas > 0) {
    out.push({
      tono: 'danger',
      relevancia: 86,
      href: `/orgs/${orgId}/dgii`,
      texto: (
        <>
          <strong>{alertas}</strong> factura(s) con <strong>alertas DGII</strong> — revísalas antes de reportar.
        </>
      ),
    });
  }
  // Sin asignar: esperan clasificación.
  if (panel.sinAsignar > 0) {
    out.push({
      tono: 'warn',
      relevancia: 80,
      href: inv(),
      texto: (
        <>
          <strong>{panel.sinAsignar}</strong> factura(s) sin asignar esperan clasificación.
        </>
      ),
    });
  }
  // Extraídas: la IA ya las leyó, faltan validar.
  const extr = conteo('extraida');
  if (extr > 0) {
    out.push({
      tono: 'info',
      relevancia: 70,
      href: inv('extraida'),
      texto: (
        <>
          <strong>{extr}</strong> leída(s) por la IA, <strong>listas para validar</strong>.
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
  return out.sort((a, b) => b.relevancia - a.relevancia).slice(0, 6);
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
