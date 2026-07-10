'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useSearchParams } from 'next/navigation';
import { api } from '../../../../lib/api';
import { useAutoRefresh } from '../../../../lib/useAutoRefresh';
import DataTable from '../../../../components/DataTable';
import Dropdown from '../../../../components/Dropdown';
import ImageLightbox from '../../../../components/ImageLightbox';
import InvoiceTimeline from '../../../../components/InvoiceTimeline';
import UploadInvoicesModal from '../../../../components/UploadInvoicesModal';
import { ESTADO_COLOR } from '../../../../components/Charts';
import { TrashIcon } from '../../../../components/icons';
import { CATEGORIAS_606, ESTADO_LABELS, type Invoice } from '../../../../lib/types';

const MESES_ABR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function periodoLabel(p: string): string {
  return `${MESES_ABR[Number(p.slice(4, 6)) - 1] ?? p.slice(4, 6)} ${p.slice(0, 4)}`;
}
// Últimos 18 períodos (AAAAMM), el más reciente primero.
function periodosRecientes(): string[] {
  const now = new Date();
  return Array.from({ length: 18 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

// Filtro de estado ordenado por relevancia para el contador. Omite "subida"
// (transitorio, dura un instante). "Procesando" queda al final por si algo se atasca.
const FILTRO_ESTADOS = [
  'en_revision',
  'extraida',
  'validada',
  'incluida_en_606',
  'reportada',
  'procesando',
  'rechazada',
  'duplicada',
];

// Qué significa cada estado (leyenda del botón de ayuda junto al filtro).
const ESTADO_AYUDA: { estado: string; texto: string }[] = [
  { estado: 'procesando', texto: 'El sistema la está leyendo (dura segundos).' },
  { estado: 'extraida', texto: 'Leída con alta confianza; falta que la valides.' },
  { estado: 'en_revision', texto: 'Necesita tu atención: dato dudoso o error.' },
  { estado: 'validada', texto: 'Revisada y confirmada; lista para el 606.' },
  { estado: 'incluida_en_606', texto: 'Incluida en un 606 generado del período.' },
  { estado: 'reportada', texto: 'El 606 ya se envió a la DGII.' },
  { estado: 'rechazada', texto: 'Descartada: no es un gasto válido.' },
  { estado: 'duplicada', texto: 'Copia de otra factura ya subida.' },
];

/** Botón "?" que despliega la leyenda de qué significa cada estado. */
function StatusLegend() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <span className="hint" ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className="hint-btn"
        style={{ width: 20, height: 20, fontSize: 12 }}
        aria-label="¿Qué significa cada estado?"
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <div className="hint-pop down">
          <div className="legend">
            {ESTADO_AYUDA.map(({ estado, texto }) => (
              <div className="legend-row" key={estado}>
                <span className="badge">{ESTADO_LABELS[estado] ?? estado}</span>
                <span>{texto}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

function money(v: number | string | null): string {
  if (v === null || v === '') return '';
  const n = typeof v === 'string' ? Number(v) : v;
  return n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Campos críticos que el OCR pudo marcar dudosos, para resaltarlos. */
function dudosos(inv: Invoice): Set<string> {
  return new Set(inv.confianzaPorCampo?.evaluation?.camposBajaConfianza ?? []);
}

/** Normaliza un nombre para comparar (sin acentos, mayúsculas ni espacios extra). */
function normNombre(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** La fecha llega como ISO completo; el formato fiscal usa solo AAAA-MM-DD. */
function fechaCorta(fecha: string | null): string {
  return fecha ? fecha.slice(0, 10) : '';
}

/** Badge de estado con color (mismo criterio que el donut del dashboard). */
function EstadoBadge({ estado }: { estado: string }) {
  const color = ESTADO_COLOR[estado] ?? 'var(--muted)';
  return (
    <span
      className="badge"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
      }}
    >
      {ESTADO_LABELS[estado] ?? estado}
    </span>
  );
}

const SORT_OPTS = [
  { value: 'fecha-desc', label: 'Fecha (reciente primero)' },
  { value: 'fecha-asc', label: 'Fecha (antigua primero)' },
  { value: 'monto-desc', label: 'Monto (mayor primero)' },
  { value: 'monto-asc', label: 'Monto (menor primero)' },
  { value: 'proveedor', label: 'Proveedor (A–Z)' },
  { value: 'cliente', label: 'Cliente (A–Z)' },
  { value: 'estado', label: 'Estado' },
];

function sortInvoices(list: Invoice[], by: string): Invoice[] {
  const arr = [...list];
  const num = (v: string | number | null | undefined) => Number(v) || 0;
  const str = (v: string | null | undefined) => (v ?? '').toLowerCase();
  arr.sort((a, b) => {
    switch (by) {
      case 'fecha-asc':
        return fechaCorta(a.fecha).localeCompare(fechaCorta(b.fecha));
      case 'monto-desc':
        return num(b.montoFacturado) - num(a.montoFacturado);
      case 'monto-asc':
        return num(a.montoFacturado) - num(b.montoFacturado);
      case 'proveedor':
        return str(a.razonSocialProveedor).localeCompare(str(b.razonSocialProveedor), 'es');
      case 'cliente':
        return str(a.clientProfile?.razonSocial).localeCompare(str(b.clientProfile?.razonSocial), 'es');
      case 'estado':
        return str(a.estado).localeCompare(str(b.estado));
      default: // fecha-desc
        return fechaCorta(b.fecha).localeCompare(fechaCorta(a.fecha));
    }
  });
  return arr;
}

/** Vista de tarjetas de facturas (alternativa a la tabla). */
function InvoiceCards({
  invoices,
  visibles,
  totalMonto,
  onOpen,
}: {
  invoices: Invoice[];
  visibles: Invoice[];
  totalMonto: number;
  onOpen: (id: string) => void;
}) {
  if (visibles.length === 0) {
    return (
      <p className="muted">
        {invoices.length === 0
          ? 'No hay facturas con estos filtros'
          : 'Ninguna factura coincide con la búsqueda'}
      </p>
    );
  }
  return (
    <>
      <div className="inv-cards">
        {visibles.map((inv) => (
          <InvoiceCard key={inv.id} inv={inv} onOpen={() => onOpen(inv.id)} />
        ))}
      </div>
      <div className="inv-cards-foot muted">
        <span>{visibles.length} factura(s)</span>
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>RD$ {money(totalMonto)}</span>
      </div>
    </>
  );
}

function InvoiceCard({ inv, onOpen }: { inv: Invoice; onOpen: () => void }) {
  const color = ESTADO_COLOR[inv.estado] ?? 'var(--muted)';
  return (
    <button type="button" className="inv-card" onClick={onOpen} style={{ borderTopColor: color }}>
      <div className="inv-card-head">
        <strong className="inv-card-prov">{inv.razonSocialProveedor ?? '—'}</strong>
        <span
          className="inv-card-estado"
          style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}
        >
          {ESTADO_LABELS[inv.estado] ?? inv.estado}
        </span>
      </div>
      <div className="inv-card-meta">
        {inv.ncf ?? 'sin NCF'} · {fechaCorta(inv.fecha) || 's/f'}
      </div>
      <div className="inv-card-foot">
        <span className="inv-card-monto">RD$ {money(inv.montoFacturado)}</span>
        <span className="inv-card-cli">
          {inv.clientProfile?.razonSocial ?? (
            <span style={{ color: 'var(--warning-text)' }}>Sin asignar</span>
          )}
        </span>
      </div>
    </button>
  );
}

export default function InvoicesPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clientes, setClientes] = useState<{ id: string; razonSocial: string }[]>([]);
  // Filtros iniciales desde la URL (enlaces del dashboard: ?estado=…&clientId=…&periodo=…).
  const [clientId, setClientId] = useState<string>(searchParams.get('clientId') ?? '');
  const [estado, setEstado] = useState<string>(searchParams.get('estado') ?? 'en_revision');
  const [periodo, setPeriodo] = useState(searchParams.get('periodo') ?? '');
  const [proveedor, setProveedor] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [sortBy, setSortBy] = useState('fecha-desc');
  const [view, setView] = useState<'table' | 'cards'>('table');
  useEffect(() => {
    try {
      const v = localStorage.getItem('facturard-inv-view');
      if (v === 'cards' || v === 'table') setView(v);
    } catch {
      /* ignore */
    }
  }, []);
  function setViewPersist(v: 'table' | 'cards') {
    setView(v);
    try {
      localStorage.setItem('facturard-inv-view', v);
    } catch {
      /* ignore */
    }
  }
  // ?open=<id> abre esa factura directo (enlaces de "omitidas" del 606).
  const [expanded, setExpanded] = useState<string | null>(searchParams.get('open'));
  const [showUpload, setShowUpload] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // El modal se renderiza por portal a <body>; esperar a montar (evita SSR).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Config de la empresa: si exige aritmética, "Total impreso" se pide a mano.
  const [requiereAritmetica, setRequiereAritmetica] = useState(true);
  // Solo el admin de la organización puede eliminar facturas.
  const [esAdmin, setEsAdmin] = useState(false);

  useEffect(() => {
    api<{ memberships: { rol: string; organization: { id: string } }[] }>(`/api/me`)
      .then((me) =>
        setEsAdmin(
          me.memberships.some((m) => m.organization.id === orgId && m.rol === 'org_admin'),
        ),
      )
      .catch(() => {});
    api<{ requiereValidacionAritmetica?: boolean }>(`/api/organizations/${orgId}`)
      .then((o) => setRequiereAritmetica(o.requiereValidacionAritmetica !== false))
      .catch(() => {});
    api<{ id: string; razonSocial: string }[]>(`/api/organizations/${orgId}/clients`)
      .then(setClientes)
      .catch(() => {});
  }, [orgId]);

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      const params = new URLSearchParams();
      if (estado) params.set('estado', estado);
      if (clientId) params.set('clientProfileId', clientId);
      if (/^\d{6}$/.test(periodo)) params.set('periodoFiscal', periodo);
      const q = params.toString() ? `?${params}` : '';
      api<Invoice[]>(`/api/organizations/${orgId}/invoices${q}`)
        .then(setInvoices)
        .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
        .finally(() => {
          if (!silent) setLoading(false);
        });
    },
    [orgId, estado, clientId, periodo],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Sincroniza con el backend: re-consulta al volver a la pestaña y cada 20 s
  // (silencioso, sin parpadeo). Se pausa mientras haya un modal abierto para no
  // interrumpir la edición.
  useAutoRefresh(
    useCallback(() => {
      if (!expanded) load(true);
    }, [expanded, load]),
  );

  // Proveedores distintos presentes en las facturas cargadas (para el filtro).
  const proveedores = Array.from(
    new Set(invoices.map((i) => i.razonSocialProveedor).filter((n): n is string => !!n)),
  ).sort((a, b) => a.localeCompare(b));

  const term = busqueda.trim().toLowerCase();
  let visibles = invoices;
  if (proveedor) visibles = visibles.filter((i) => (i.razonSocialProveedor ?? '') === proveedor);
  if (term)
    visibles = visibles.filter((i) =>
      [i.razonSocialProveedor, i.ncf, i.clientProfile?.razonSocial].some((f) =>
        (f ?? '').toLowerCase().includes(term),
      ),
    );

  // Total al pie: lo que el contador quiere ver de un vistazo del período.
  const totalMonto = visibles.reduce((acc, i) => acc + (Number(i.montoFacturado) || 0), 0);

  // "Guardar y siguiente": tras guardar, salta a la próxima factura visible sin
  // cerrar el modal (revisar 80 facturas en cadena). Si no hay más, cierra.
  const irASiguiente = useCallback(
    (actualId: string) => {
      const ids = visibles.map((i) => i.id);
      const idx = ids.indexOf(actualId);
      const siguiente = idx >= 0 ? ids[idx + 1] : undefined;
      load();
      setExpanded(siguiente ?? null);
    },
    [visibles, load],
  );

  return (
    <>
      <h1>Facturas</h1>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <div className="inv-filters">
          <Dropdown
            ariaLabel="Cliente"
            icon={<span aria-hidden>🏢</span>}
            value={clientId}
            onChange={setClientId}
            options={[
              { value: '', label: 'Todos los clientes' },
              ...clientes.map((c) => ({ value: c.id, label: c.razonSocial })),
            ]}
          />
          <div className="inv-estado">
            <Dropdown
              ariaLabel="Estado"
              icon={<span aria-hidden>🏷️</span>}
              value={estado}
              onChange={setEstado}
              options={[
                { value: '', label: 'Todos los estados' },
                ...FILTRO_ESTADOS.map((s) => ({ value: s, label: ESTADO_LABELS[s] })),
              ]}
            />
            <StatusLegend />
          </div>
          <Dropdown
            ariaLabel="Período"
            icon={<span aria-hidden>📅</span>}
            value={periodo}
            onChange={setPeriodo}
            options={[
              { value: '', label: 'Todos los períodos' },
              ...(periodo && !periodosRecientes().includes(periodo)
                ? [{ value: periodo, label: periodoLabel(periodo) }]
                : []),
              ...periodosRecientes().map((p, i) => ({
                value: p,
                label: i === 0 ? `Este mes · ${periodoLabel(p)}` : periodoLabel(p),
              })),
            ]}
          />
          <Dropdown
            ariaLabel="Proveedor"
            icon={<span aria-hidden>🚚</span>}
            value={proveedor}
            onChange={setProveedor}
            options={[
              { value: '', label: 'Todos los proveedores' },
              ...proveedores.map((p) => ({ value: p, label: p })),
            ]}
          />
          <div className="select-search" style={{ maxWidth: 260 }}>
            <span aria-hidden>🔍</span>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar proveedor o NCF…"
              aria-label="Buscar"
            />
            {busqueda && (
              <button type="button" className="select-clear" onClick={() => setBusqueda('')} aria-label="Limpiar">
                ✕
              </button>
            )}
          </div>
          {view === 'cards' && (
            <div style={{ marginLeft: 'auto' }}>
              <Dropdown
                ariaLabel="Ordenar"
                icon={<span aria-hidden>↕</span>}
                value={sortBy}
                onChange={setSortBy}
                options={SORT_OPTS}
              />
            </div>
          )}
          <div
            className="view-toggle"
            style={{ marginLeft: view === 'cards' ? 0 : 'auto' }}
            role="group"
            aria-label="Vista"
          >
            <button
              className={view === 'table' ? 'active' : ''}
              onClick={() => setViewPersist('table')}
              aria-label="Vista de tabla"
              title="Tabla"
            >
              ☰
            </button>
            <button
              className={view === 'cards' ? 'active' : ''}
              onClick={() => setViewPersist('cards')}
              aria-label="Vista de tarjetas"
              title="Tarjetas"
            >
              ▦
            </button>
          </div>
          <button onClick={() => setShowUpload(true)} style={{ flexShrink: 0 }}>
            ⬆ Subir facturas
          </button>
        </div>
      </div>

      {showUpload && (
        <UploadInvoicesModal
          orgId={orgId}
          clientes={clientes}
          onClose={() => setShowUpload(false)}
          onUploaded={(subidas) => {
            if (subidas > 0) load();
          }}
        />
      )}

      <div className="card">
        {loading ? (
          <p className="muted">Cargando…</p>
        ) : view === 'cards' ? (
          <InvoiceCards
            invoices={invoices}
            visibles={sortInvoices(visibles, sortBy)}
            totalMonto={totalMonto}
            onOpen={setExpanded}
          />
        ) : (
          <DataTable
            rows={visibles}
            getKey={(inv) => inv.id}
            initialSort={{ key: 'fecha', dir: 'desc' }}
            exportFileName={`facturas${periodo ? '_' + periodo : ''}`}
            emptyText={
              invoices.length === 0
                ? 'No hay facturas con estos filtros'
                : 'Ninguna factura coincide con la búsqueda'
            }
            columns={[
              {
                key: 'cliente',
                header: 'Cliente',
                value: (inv) => inv.clientProfile?.razonSocial ?? '',
                render: (inv) =>
                  inv.clientProfile?.razonSocial ?? (
                    <span style={{ color: 'var(--warning-text)' }}>Sin asignar</span>
                  ),
              },
              {
                key: 'proveedor',
                header: 'Proveedor',
                value: (inv) => inv.razonSocialProveedor ?? '',
                render: (inv) => inv.razonSocialProveedor ?? '—',
              },
              { key: 'ncf', header: 'NCF', value: (inv) => inv.ncf ?? '' , render: (inv) => inv.ncf ?? '—' },
              {
                key: 'fecha',
                header: 'Fecha',
                value: (inv) => fechaCorta(inv.fecha),
                render: (inv) => fechaCorta(inv.fecha) || '—',
              },
              {
                key: 'monto',
                header: 'Monto',
                align: 'right',
                value: (inv) => Number(inv.montoFacturado) || 0,
                csv: (inv) => (inv.montoFacturado == null ? '' : Number(inv.montoFacturado)),
                render: (inv) => (
                  <strong style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {money(inv.montoFacturado)}
                  </strong>
                ),
              },
              {
                key: 'estado',
                header: 'Estado',
                value: (inv) => ESTADO_LABELS[inv.estado] ?? inv.estado,
                render: (inv) => <EstadoBadge estado={inv.estado} />,
              },
              {
                key: 'accion',
                header: '',
                align: 'right',
                render: (inv) => (
                  <button
                    className="btn-revisar"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded(inv.id);
                    }}
                  >
                    Revisar
                    <span aria-hidden>→</span>
                  </button>
                ),
              },
            ]}
            footer={
              visibles.length > 0 ? (
                <tfoot>
                  <tr>
                    <td colSpan={4} style={{ fontWeight: 600 }}>
                      {visibles.length} factura(s)
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>RD$ {money(totalMonto)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              ) : undefined
            }
            onRowClick={(inv) => setExpanded(inv.id)}
          />
        )}
      </div>

      {(() => {
        const sel = expanded ? invoices.find((i) => i.id === expanded) : undefined;
        if (!sel || !mounted) return null;
        // Portal a <body>: escapa cualquier transform de ancestros (p. ej. la
        // animación de .app-content) que rompía el position:fixed del overlay.
        return createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(10, 12, 24, 0.55)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              padding: '24px 16px',
              overflowY: 'auto',
              zIndex: 50,
            }}
          >
            {/* Sin cerrar al clic en el fondo: evita perder ediciones (usar ✕ o Esc, con guardia). */}
            <div style={{ width: '100%', maxWidth: 1120 }}>
              <ReviewPanel
                key={sel.id}
                orgId={orgId}
                invoice={sel}
                clientes={clientes}
                requiereAritmetica={requiereAritmetica}
                esAdmin={esAdmin}
                haySiguiente={
                  visibles.findIndex((i) => i.id === sel.id) < visibles.length - 1
                }
                onClose={() => {
                  setExpanded(null);
                  load();
                }}
                onSaved={() => {
                  setExpanded(null);
                  load();
                }}
                onSavedNext={() => irASiguiente(sel.id)}
              />
            </div>
          </div>,
          document.body,
        );
      })()}
    </>
  );
}

/** Nombres legibles de los campos que el OCR puede marcar dudosos. */
const CAMPO_LABEL: Record<string, string> = {
  rnc_proveedor: 'RNC del proveedor',
  razon_social: 'Razón social',
  ncf: 'NCF',
  fecha: 'Fecha',
  monto_facturado: 'Monto facturado',
  itbis: 'ITBIS',
  monto_total: 'Monto total',
  propina_legal: 'Propina legal',
};
const campoLabel = (k: string) => CAMPO_LABEL[k] ?? k;

/** Tipo de identificación del 606 por longitud: 9 díg → RNC (1); 11 díg → Cédula (2). */
function tipoIdPorLongitud(rnc: string): '1' | '2' {
  return rnc.replace(/\D/g, '').length === 11 ? '2' : '1';
}

function ReviewPanel({
  orgId,
  invoice,
  clientes,
  requiereAritmetica,
  esAdmin,
  haySiguiente,
  onSaved,
  onSavedNext,
  onClose,
}: {
  orgId: string;
  invoice: Invoice;
  clientes: { id: string; razonSocial: string }[];
  requiereAritmetica: boolean;
  esAdmin: boolean;
  haySiguiente: boolean;
  onSaved: () => void;
  onSavedNext: () => void;
  onClose: () => void;
}) {
  const marcados = dudosos(invoice);
  const str = (v: number | string | null | undefined) => (v == null ? '' : v.toString());
  // Nombre tal cual lo leyó el OCR del recibo (suele ser comercial/de sucursal).
  const nombreImpreso = (invoice.confianzaPorCampo?.extraction?.razon_social?.valor ?? '').trim();
  // Cliente cuyo RNC casi coincide con el comprador leído (el worker lo sugiere
  // cuando el OCR perdió/duplicó un dígito; nunca se auto-asigna una adivinanza).
  const sugerenciaCliente = invoice.confianzaPorCampo?.sugerenciaCliente ?? null;
  // Total impreso: si la empresa NO exige validación aritmética, lo autocompletamos
  // con la suma; si la exige, se deja vacío para que el contador lo digite y cuadre.
  const sumaInicial =
    (Number(invoice.montoFacturado) || 0) +
    (Number(invoice.itbis) || 0) +
    (Number(invoice.propinaLegal) || 0);
  const [form, setForm] = useState({
    // Empresa (cliente) a la que pertenece la factura
    clientProfileId: invoice.clientProfile?.id ?? '',
    // Tab 1 · básico (col. 1–11 + forma de pago)
    rncProveedor: invoice.rncProveedor ?? '',
    // Tipo de documento: si no vino guardado, lo derivamos por longitud (nunca "automático").
    tipoIdProveedor: invoice.tipoIdProveedor || tipoIdPorLongitud(invoice.rncProveedor ?? ''),
    razonSocialProveedor: invoice.razonSocialProveedor ?? '',
    categoria606: invoice.categoria606 ?? '',
    ncf: invoice.ncf ?? '',
    ncfModificado: invoice.ncfModificado ?? '',
    fecha: fechaCorta(invoice.fecha),
    fechaPago: fechaCorta(invoice.fechaPago ?? null),
    tipoBienServicio: invoice.tipoBienServicio ?? 'bienes',
    montoFacturado: str(invoice.montoFacturado),
    itbis: str(invoice.itbis),
    montoTotal: requiereAritmetica || sumaInicial === 0 ? '' : sumaInicial.toFixed(2),
    formaPago: invoice.formaPago ?? '',
    // Tab 2 · avanzado (col. 12–23)
    itbisRetenido: str(invoice.itbisRetenido),
    itbisProporcionalidad: str(invoice.itbisProporcionalidad),
    itbisCosto: str(invoice.itbisCosto),
    itbisPercibido: str(invoice.itbisPercibido),
    tipoRetencionIsr: invoice.tipoRetencionIsr ?? '',
    montoRetencionRenta: str(invoice.montoRetencionRenta),
    isrPercibido: str(invoice.isrPercibido),
    impuestoSelectivo: str(invoice.impuestoSelectivo),
    otrosImpuestos: str(invoice.otrosImpuestos),
    propinaLegal: str(invoice.propinaLegal),
  });
  const [tab, setTab] = useState<'basico' | 'avanzado'>('basico');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showHint, setShowHint] = useState(false);
  // Estado local para reflejar cambios sin cerrar el modal (dropdown "Cambiar estado").
  const [estadoActual, setEstadoActual] = useState(invoice.estado);
  // Tras un intento de validar, resaltamos en rojo los requeridos que falten.
  const [intentoValidar, setIntentoValidar] = useState(false);
  const hintRef = useRef<HTMLDivElement>(null);
  const [imageUrls, setImageUrls] = useState<string[] | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null); // índice de imagen ampliada
  const [subidoPor, setSubidoPor] = useState<{ nombre: string; email: string } | null>(null);

  useEffect(() => {
    api<{
      imageUrl?: string;
      imageUrls?: string[];
      subidoPor?: { nombre: string; email: string } | null;
    }>(`/api/organizations/${orgId}/invoices/${invoice.id}`)
      .then((d) => {
        setImageUrls(d.imageUrls ?? (d.imageUrl ? [d.imageUrl] : []));
        setSubidoPor(d.subidoPor ?? null);
      })
      .catch(() => {});
  }, [orgId, invoice.id]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setDirty(true);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  // Cerrar con guardia: si hay cambios sin guardar, confirmar el descarte.
  const closeGuarded = useCallback(() => {
    if (dirty && !confirm('Tienes cambios sin guardar. ¿Descartarlos?')) return;
    onClose();
  }, [dirty, onClose]);

  // Cierra el hint al hacer clic fuera de él.
  useEffect(() => {
    if (!showHint) return;
    function onDown(e: MouseEvent) {
      if (hintRef.current && !hintRef.current.contains(e.target as Node)) setShowHint(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showHint]);

  const req = (on?: boolean) => (on ? <span style={{ color: 'var(--danger)' }}> *</span> : null);

  // Borde rojo si el campo es requerido, está vacío y ya se intentó validar.
  const faltante = (key: keyof typeof form, required?: boolean) =>
    !!required && intentoValidar && String(form[key]).trim() === '';
  const errBorder = (key: keyof typeof form, required?: boolean) =>
    faltante(key, required) ? { borderColor: 'var(--danger)' } : undefined;

  const numField = (
    label: string,
    key: keyof typeof form,
    critical?: string,
    full?: boolean,
    required?: boolean,
  ) => (
    <div className={full ? 'full' : undefined}>
      <label style={marcados.has(critical ?? '') ? { color: 'var(--warning-text)' } : undefined}>
        {label}
        {marcados.has(critical ?? '') ? ' ⚠' : ''}
        {req(required)}
      </label>
      <input value={form[key]} onChange={set(key)} inputMode="decimal" style={errBorder(key, required)} />
    </div>
  );

  const textField = (
    label: string,
    key: keyof typeof form,
    placeholder?: string,
    full?: boolean,
    required?: boolean,
  ) => (
    <div className={full ? 'full' : undefined}>
      <label>
        {label}
        {req(required)}
      </label>
      <input
        value={form[key]}
        onChange={set(key)}
        placeholder={placeholder}
        style={errBorder(key, required)}
      />
    </div>
  );

  const selectField = (
    label: string,
    key: keyof typeof form,
    options: { value: string; label: string }[],
    full?: boolean,
  ) => (
    <div className={full ? 'full' : undefined}>
      <label>{label}</label>
      <select value={form[key]} onChange={set(key)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  // Guarda (y opcionalmente valida). Devuelve true si tuvo éxito, para que
  // quien llama decida cerrar, saltar a la siguiente, o quedarse por el error.
  async function save(validar: boolean): Promise<boolean> {
    if (validar) setIntentoValidar(true);
    setBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = {};
      const textKeys = [
        'clientProfileId',
        'ncf', 'rncProveedor', 'razonSocialProveedor', 'fecha', 'categoria606',
        'tipoIdProveedor', 'ncfModificado', 'fechaPago', 'tipoBienServicio',
        'formaPago', 'tipoRetencionIsr',
      ] as const;
      for (const k of textKeys) body[k] = form[k] || undefined;
      const numKeys = [
        'montoFacturado', 'itbis', 'montoTotal', 'propinaLegal', 'otrosImpuestos',
        'itbisRetenido', 'itbisProporcionalidad', 'itbisCosto', 'itbisPercibido',
        'montoRetencionRenta', 'isrPercibido', 'impuestoSelectivo',
      ] as const;
      for (const k of numKeys) if (form[k] !== '') body[k] = Number(form[k]);
      body.validar = validar;
      await api(`/api/organizations/${orgId}/invoices/${invoice.id}/review`, {
        method: 'PATCH',
        body,
      });
      setDirty(false);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const guardar = async (cerrar: boolean) => {
    if (await save(false) && cerrar) onSaved();
  };
  const guardarYValidar = async () => {
    if (await save(true)) onSaved();
  };
  const validarYSiguiente = async () => {
    if (await save(true)) onSavedNext();
  };

  // Atajos: Esc cierra (con guardia), ⌘/Ctrl+Enter valida y avanza en cadena.
  useEffect(() => {
    async function onKey(e: KeyboardEvent) {
      if (busy) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeGuarded();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (await save(true)) (haySiguiente ? onSavedNext : onSaved)();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // save/closeGuarded capturan `form`; re-suscribir al cambiar mantiene frescas las lecturas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, haySiguiente, dirty, form]);

  // Cambia el estado desde el dropdown SIN cerrar el modal. Pasar a "validada"
  // ejecuta la validación completa (guarda + valida requeridos); los demás
  // estados solo cambian el estado.
  async function changeStatus(estado: string) {
    if (!estado || estado === estadoActual) return;
    if (estado === 'validada') {
      // Igual que "Validar": revisa que los requeridos estén completos.
      if (await save(true)) setEstadoActual('validada');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`/api/organizations/${orgId}/invoices/${invoice.id}/estado`, {
        method: 'PATCH',
        body: { estado },
      });
      setEstadoActual(estado);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado');
    } finally {
      setBusy(false);
    }
  }

  // Eliminar la factura (solo admin). Confirmación explícita — es irreversible.
  async function eliminar() {
    const prov = invoice.razonSocialProveedor ?? 'esta factura';
    if (!confirm(`¿Eliminar ${prov}? Esta acción no se puede deshacer.`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/organizations/${orgId}/invoices/${invoice.id}`, { method: 'DELETE' });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar la factura');
      setBusy(false);
    }
  }

  return (
    <div
      className="card"
      style={{
        maxHeight: 'calc(100dvh - 48px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 12,
          flexShrink: 0,
        }}
      >
        <h2 style={{ margin: 0, flex: 1 }}>Revisar factura</h2>
        <span className="badge">{ESTADO_LABELS[estadoActual] ?? estadoActual}</span>
        <button
          type="button"
          className="secondary"
          onClick={closeGuarded}
          style={{ margin: 0, padding: '4px 12px' }}
          aria-label="Cerrar (Esc)"
          title="Cerrar (Esc)"
        >
          ✕
        </button>
      </div>

      {/* Split view: imagen fija a la izquierda, formulario a la derecha (se apila en móvil).
          El contenedor scrollea internamente; el encabezado queda fijo arriba. */}
      <div
        style={{
          display: 'flex',
          gap: 20,
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          {imageUrls === null ? (
            <p className="muted">Cargando imagen…</p>
          ) : imageUrls.length === 0 ? (
            <p className="muted">Sin imagen.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {imageUrls.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightbox(i)}
                  title="Ampliar imagen"
                  style={{
                    margin: 0,
                    padding: 0,
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    overflow: 'hidden',
                    cursor: 'zoom-in',
                    background: 'var(--bg-soft)',
                    position: 'relative',
                    display: 'block',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Página ${i + 1} de la factura`}
                    style={{ width: '100%', display: 'block' }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      right: 8,
                      bottom: 8,
                      background: 'rgba(0,0,0,0.6)',
                      color: '#fff',
                      borderRadius: 999,
                      padding: '4px 10px',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    🔍 Ampliar{imageUrls.length > 1 ? ` · ${i + 1}/${imageUrls.length}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}

          {subidoPor && (
            <p className="muted" style={{ margin: '10px 0 0', fontSize: 13 }}>
              Subido por <strong>{subidoPor.nombre || subidoPor.email}</strong>
            </p>
          )}

          <InvoiceTimeline orgId={orgId} invoiceId={invoice.id} />

          {/* Alertas y validaciones: aprovechan el espacio bajo la imagen. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {error && (
              <div className="error" style={{ margin: 0 }}>
                {error}
              </div>
            )}
            {invoice.validacionDgii && invoice.validacionDgii.alertas.length > 0 && (
              <div className="error" style={{ margin: 0 }}>
                <strong>Revisa antes de reportar a la DGII:</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {invoice.validacionDgii.alertas.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
            {marcados.size > 0 && (
              <div className="notice" style={{ margin: 0 }}>
                La IA marcó como dudosos: {[...marcados].map(campoLabel).join(', ')}. Verifícalos
                contra la imagen.
              </div>
            )}
            {invoice.confianzaPorCampo?.error && (
              <div className="notice" style={{ margin: 0 }}>
                OCR: {invoice.confianzaPorCampo.error}
              </div>
            )}
            {invoice.validacionDgii?.ok && (
              <p style={{ color: 'var(--ok)', fontSize: 14, margin: 0 }}>
                ✓ NCF, RNC y padrón DGII verificados
              </p>
            )}
            {invoice.validacionDgii?.ecf?.verificado && invoice.validacionDgii.ecf.aceptado && (
              <p style={{ color: 'var(--ok)', fontSize: 14, margin: 0 }}>
                {invoice.validacionDgii.ecf.serie === 'B'
                  ? '✓ NCF verificado en vivo con la DGII (válido)'
                  : '✓ e-CF verificado en vivo con la DGII (Aceptado)'}
              </p>
            )}
          </div>
        </div>

        <div style={{ flex: '2 1 440px', minWidth: 320 }}>
      <div style={{ marginBottom: 12, maxWidth: 280 }}>
        <label style={{ margin: '0 0 4px' }}>Cambiar estado (corregir error)</label>
        <select value="" onChange={(e) => changeStatus(e.target.value)} disabled={busy}>
          <option value="">Mover a…</option>
          <option value="en_revision">En revisión</option>
          <option value="validada">Validada</option>
          <option value="rechazada">Rechazada</option>
        </select>
      </div>

      <div className="seg" style={{ margin: '4px 0 16px' }}>
        <button
          type="button"
          className={tab === 'basico' ? 'seg-item active' : 'seg-item'}
          onClick={() => setTab('basico')}
        >
          Datos básicos (1–11)
        </button>
        <button
          type="button"
          className={tab === 'avanzado' ? 'seg-item active' : 'seg-item'}
          onClick={() => setTab('avanzado')}
        >
          Retenciones e impuestos (12–23)
        </button>
      </div>

      {tab === 'basico' ? (
        <div className="review-form">
          {selectField(
            'Empresa (cliente)',
            'clientProfileId',
            [
              { value: '', label: '— Sin asignar —' },
              ...clientes.map((c) => ({ value: c.id, label: c.razonSocial })),
            ],
            true,
          )}
          {!form.clientProfileId && sugerenciaCliente && (
            <div className="full" style={{ marginTop: -6 }}>
              <small style={{ display: 'block', fontSize: 13, color: 'var(--muted)' }}>
                ℹ El RNC del comprador leído en la foto (
                {invoice.confianzaPorCampo?.extraction?.rnc_comprador?.valor ?? '—'}) casi
                coincide con <strong>{sugerenciaCliente.razonSocial}</strong> (
                {sugerenciaCliente.rnc}).{' '}
                <button
                  type="button"
                  className="linklike"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--brand)',
                    cursor: 'pointer',
                    font: 'inherit',
                    textDecoration: 'underline',
                  }}
                  onClick={() => {
                    setDirty(true);
                    setForm((f) => ({ ...f, clientProfileId: sugerenciaCliente.id }));
                  }}
                >
                  Asignar a este cliente
                </button>
              </small>
            </div>
          )}

          <div>
            <label style={marcados.has('rnc_proveedor') ? { color: 'var(--warning-text)' } : undefined}>
              RNC / Cédula del proveedor{marcados.has('rnc_proveedor') ? ' ⚠' : ''}
              {req(true)}
            </label>
            <input
              value={form.rncProveedor}
              onChange={(e) => {
                const v = e.target.value;
                setDirty(true);
                // El tipo sigue la longitud (RNC 9 → 1, Cédula 11 → 2); editable abajo.
                setForm((f) => ({ ...f, rncProveedor: v, tipoIdProveedor: tipoIdPorLongitud(v) }));
              }}
              style={errBorder('rncProveedor', true)}
            />
          </div>
          {selectField('Tipo de documento', 'tipoIdProveedor', [
            { value: '1', label: '1 · RNC (9 dígitos)' },
            { value: '2', label: '2 · Cédula (11 dígitos)' },
          ])}

          <div className="full">
            <label>Razón social del proveedor</label>
            <input value={form.razonSocialProveedor} onChange={set('razonSocialProveedor')} />
            {nombreImpreso &&
              normNombre(nombreImpreso) !== normNombre(form.razonSocialProveedor) && (
                <small
                  style={{
                    display: 'block',
                    marginTop: 6,
                    fontSize: 13,
                    color: 'var(--muted)',
                  }}
                >
                  ℹ El nombre en tu foto (<strong>«{nombreImpreso}»</strong>) no coincide con el
                  registrado en la DGII. Dejamos el oficial; cámbialo si prefieres el de la foto.
                </small>
              )}
          </div>

          {selectField('Tipo de bienes/servicios (606)', 'categoria606', [
            { value: '', label: 'Sin asignar' },
            ...Object.entries(CATEGORIAS_606).map(([code, nombre]) => ({
              value: code,
              label: `${code} — ${nombre}`,
            })),
          ])}
          {selectField('Bienes o servicios', 'tipoBienServicio', [
            { value: 'bienes', label: 'Bienes' },
            { value: 'servicios', label: 'Servicios' },
          ])}

          {textField('NCF', 'ncf', 'B0100000001', false, true)}
          {textField('NCF modificado (nota créd./déb.)', 'ncfModificado')}

          <div>
            <label style={marcados.has('fecha') ? { color: 'var(--warning-text)' } : undefined}>
              Fecha comprobante (AAAA-MM-DD){marcados.has('fecha') ? ' ⚠' : ''}
              {req(true)}
            </label>
            <input
              value={form.fecha}
              onChange={set('fecha')}
              placeholder="2026-05-14"
              style={errBorder('fecha', true)}
            />
          </div>
          {textField('Fecha de pago (AAAA-MM-DD)', 'fechaPago', 'opcional')}

          {numField('Monto facturado (subtotal)', 'montoFacturado', 'monto_facturado', false, true)}
          {numField('ITBIS facturado', 'itbis', 'itbis', false, true)}

          {selectField('Forma de pago', 'formaPago', [
            { value: '', label: 'Sin especificar' },
            { value: '1', label: '1 · Efectivo' },
            { value: '2', label: '2 · Cheque / transferencia' },
            { value: '3', label: '3 · Tarjeta crédito/débito' },
            { value: '4', label: '4 · Compra a crédito' },
            { value: '5', label: '5 · Permuta' },
            { value: '6', label: '6 · Nota de crédito' },
            { value: '7', label: '7 · Mixto / otras' },
          ])}
          {numField('Total impreso (verifica aritmética)', 'montoTotal', undefined, false, requiereAritmetica)}

          <p className="muted full" style={{ margin: '4px 0 0', fontSize: 12 }}>
            <span style={{ color: 'var(--danger)' }}>*</span> Campos requeridos para validar.
          </p>
        </div>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Columnas avanzadas del 606. Déjalas en blanco si no aplican.
          </p>
          <div className="review-form">
            {numField('ITBIS retenido', 'itbisRetenido')}
            {numField('ITBIS proporcionalidad (Art. 349)', 'itbisProporcionalidad')}
            {numField('ITBIS llevado al costo', 'itbisCosto')}
            {numField('ITBIS percibido', 'itbisPercibido')}
            {selectField('Tipo de retención en ISR', 'tipoRetencionIsr', [
              { value: '', label: 'Sin retención' },
              { value: '01', label: '01 · Alquileres' },
              { value: '02', label: '02 · Honorarios por servicios' },
              { value: '03', label: '03 · Otras rentas' },
              { value: '04', label: '04 · Rentas presuntas' },
              { value: '05', label: '05 · Intereses pagados a PJ' },
              { value: '06', label: '06 · Intereses pagados a PF' },
              { value: '07', label: '07 · Proveedores del Estado' },
              { value: '08', label: '08 · Juegos de azar' },
            ])}
            {numField('Monto retención renta', 'montoRetencionRenta')}
            {numField('ISR percibido', 'isrPercibido')}
            {numField('Impuesto selectivo al consumo', 'impuestoSelectivo')}
            {numField('Otros impuestos / tasas', 'otrosImpuestos')}
            {numField('Propina legal', 'propinaLegal')}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
        {esAdmin && (
          <button
            className="danger icon-btn"
            onClick={eliminar}
            disabled={busy}
            style={{ borderColor: 'var(--danger)', marginRight: 4 }}
            title="Eliminar factura (solo administrador)"
            aria-label="Eliminar factura"
          >
            <TrashIcon size={18} />
          </button>
        )}
        <button className="danger" onClick={closeGuarded} disabled={busy}>
          Cancelar
        </button>
        <button className="secondary" onClick={() => guardar(true)} disabled={busy}>
          Guardar
        </button>
        <button
          className={haySiguiente ? 'secondary' : undefined}
          onClick={guardarYValidar}
          disabled={busy}
          title={haySiguiente ? undefined : '⌘/Ctrl + Enter'}
        >
          {busy ? 'Validando…' : 'Validar'}
        </button>
        {haySiguiente && (
          <button onClick={validarYSiguiente} disabled={busy} title="⌘/Ctrl + Enter">
            {busy ? 'Guardando…' : 'Validar y siguiente →'}
          </button>
        )}
        {/* Ayuda: qué hace cada botón (hint). */}
        <div className="hint" ref={hintRef} style={{ marginLeft: 'auto', position: 'relative' }}>
          <button
            type="button"
            className="hint-btn"
            aria-label="¿Qué hace cada botón?"
            onClick={() => setShowHint((v) => !v)}
          >
            ?
          </button>
          {showHint && (
            <div className="hint-pop">
              <strong>Cancelar</strong>: cierra sin guardar.
              <br />
              <strong>Guardar</strong>: guarda el avance sin validar.
              <br />
              <strong>Validar</strong>: guarda y valida la factura (los campos con{' '}
              <span style={{ color: 'var(--danger)' }}>*</span> deben estar completos, y la
              aritmética cuadrar si está activada).
              {haySiguiente && (
                <>
                  <br />
                  <strong>Validar y siguiente</strong> (⌘/Ctrl+Enter): igual, pero salta a la próxima
                  factura de la lista sin cerrar.
                </>
              )}
              {esAdmin && (
                <>
                  <br />
                  <strong>Eliminar</strong>: borra la factura (irreversible, solo admin).
                </>
              )}
            </div>
          )}
        </div>
      </div>
        </div>
      </div>
      {lightbox !== null && imageUrls && imageUrls.length > 0 && (
        <ImageLightbox urls={imageUrls} startIndex={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
