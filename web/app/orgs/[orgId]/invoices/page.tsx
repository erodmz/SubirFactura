'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api } from '../../../../lib/api';
import { CATEGORIAS_606, ESTADO_LABELS, type Invoice } from '../../../../lib/types';

const ESTADOS = Object.keys(ESTADO_LABELS);

function money(v: number | string | null): string {
  if (v === null || v === '') return '';
  const n = typeof v === 'string' ? Number(v) : v;
  return n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Campos críticos que el OCR pudo marcar dudosos, para resaltarlos. */
function dudosos(inv: Invoice): Set<string> {
  return new Set(inv.confianzaPorCampo?.evaluation?.camposBajaConfianza ?? []);
}

/** La fecha llega como ISO completo; el formato fiscal usa solo AAAA-MM-DD. */
function fechaCorta(fecha: string | null): string {
  return fecha ? fecha.slice(0, 10) : '';
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
  const [busqueda, setBusqueda] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ id: string; razonSocial: string }[]>(`/api/organizations/${orgId}/clients`)
      .then(setClientes)
      .catch(() => {});
  }, [orgId]);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (estado) params.set('estado', estado);
    if (clientId) params.set('clientProfileId', clientId);
    if (/^\d{6}$/.test(periodo)) params.set('periodoFiscal', periodo);
    const q = params.toString() ? `?${params}` : '';
    api<Invoice[]>(`/api/organizations/${orgId}/invoices${q}`)
      .then(setInvoices)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false));
  }, [orgId, estado, clientId, periodo]);

  useEffect(load, [load]);

  const term = busqueda.trim().toLowerCase();
  const visibles = term
    ? invoices.filter((i) =>
        [i.razonSocialProveedor, i.ncf, i.clientProfile?.razonSocial]
          .some((f) => (f ?? '').toLowerCase().includes(term)),
      )
    : invoices;

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
        <div className="row">
          <div>
            <label>Cliente</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Todos los clientes</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razonSocial}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Estado</label>
            <select value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos los estados</option>
              {ESTADOS.map((s) => (
                <option key={s} value={s}>
                  {ESTADO_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Período fiscal (AAAAMM)</label>
            <input
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value.trim())}
              placeholder="Todos"
              maxLength={6}
              inputMode="numeric"
            />
          </div>
          <div>
            <label>Buscar (proveedor o NCF)</label>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Ej. Ferretería o B0100…"
            />
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p className="muted">Cargando…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Proveedor</th>
                <th>NCF</th>
                <th>Fecha</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((inv) => (
                <tr key={inv.id}>
                  <td>
                    {inv.clientProfile?.razonSocial ?? (
                      <span style={{ color: 'var(--warning-text)' }}>Sin asignar</span>
                    )}
                  </td>
                  <td>{inv.razonSocialProveedor ?? '—'}</td>
                  <td>{inv.ncf ?? '—'}</td>
                  <td>{fechaCorta(inv.fecha) || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{money(inv.montoFacturado)}</td>
                  <td>
                    <span className="badge">{ESTADO_LABELS[inv.estado] ?? inv.estado}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <a style={{ cursor: 'pointer' }} onClick={() => setExpanded(inv.id)}>
                      Revisar
                    </a>
                  </td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    {invoices.length === 0
                      ? 'No hay facturas con estos filtros'
                      : 'Ninguna factura coincide con la búsqueda'}
                  </td>
                </tr>
              )}
            </tbody>
            {visibles.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ fontWeight: 600 }}>
                    {visibles.length} factura(s)
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>RD$ {money(totalMonto)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {(() => {
        const sel = expanded ? invoices.find((i) => i.id === expanded) : undefined;
        if (!sel) return null;
        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(10, 12, 24, 0.55)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              padding: '32px 16px',
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
                haySiguiente={
                  visibles.findIndex((i) => i.id === sel.id) < visibles.length - 1
                }
                onClose={() => setExpanded(null)}
                onSaved={() => {
                  setExpanded(null);
                  load();
                }}
                onSavedNext={() => irASiguiente(sel.id)}
              />
            </div>
          </div>
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

function ReviewPanel({
  orgId,
  invoice,
  clientes,
  haySiguiente,
  onSaved,
  onSavedNext,
  onClose,
}: {
  orgId: string;
  invoice: Invoice;
  clientes: { id: string; razonSocial: string }[];
  haySiguiente: boolean;
  onSaved: () => void;
  onSavedNext: () => void;
  onClose: () => void;
}) {
  const marcados = dudosos(invoice);
  const str = (v: number | string | null | undefined) => (v == null ? '' : v.toString());
  const [form, setForm] = useState({
    // Empresa (cliente) a la que pertenece la factura
    clientProfileId: invoice.clientProfile?.id ?? '',
    // Tab 1 · básico (col. 1–11 + forma de pago)
    rncProveedor: invoice.rncProveedor ?? '',
    tipoIdProveedor: invoice.tipoIdProveedor ?? '',
    razonSocialProveedor: invoice.razonSocialProveedor ?? '',
    categoria606: invoice.categoria606 ?? '',
    ncf: invoice.ncf ?? '',
    ncfModificado: invoice.ncfModificado ?? '',
    fecha: fechaCorta(invoice.fecha),
    fechaPago: fechaCorta(invoice.fechaPago ?? null),
    tipoBienServicio: invoice.tipoBienServicio ?? 'bienes',
    montoFacturado: str(invoice.montoFacturado),
    itbis: str(invoice.itbis),
    montoTotal: '',
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
  const [imageUrls, setImageUrls] = useState<string[] | null>(null);

  useEffect(() => {
    api<{ imageUrl?: string; imageUrls?: string[] }>(
      `/api/organizations/${orgId}/invoices/${invoice.id}`,
    )
      .then((d) => setImageUrls(d.imageUrls ?? (d.imageUrl ? [d.imageUrl] : [])))
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

  const numField = (label: string, key: keyof typeof form, critical?: string) => (
    <div>
      <label style={marcados.has(critical ?? '') ? { color: 'var(--warning-text)' } : undefined}>
        {label}
        {marcados.has(critical ?? '') ? ' ⚠' : ''}
      </label>
      <input value={form[key]} onChange={set(key)} inputMode="decimal" />
    </div>
  );

  const textField = (label: string, key: keyof typeof form, placeholder?: string) => (
    <div>
      <label>{label}</label>
      <input value={form[key]} onChange={set(key)} placeholder={placeholder} />
    </div>
  );

  const selectField = (
    label: string,
    key: keyof typeof form,
    options: { value: string; label: string }[],
  ) => (
    <div>
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

  // Suma esperada según los montos capturados (para validar contra el total impreso).
  const sumaCalculada = (['montoFacturado', 'itbis', 'propinaLegal'] as const).reduce(
    (acc, k) => acc + (Number(form[k]) || 0),
    0,
  );

  // Guarda (y opcionalmente valida). Devuelve true si tuvo éxito, para que
  // quien llama decida cerrar, saltar a la siguiente, o quedarse por el error.
  async function save(validar: boolean): Promise<boolean> {
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

  // Corregir el estado manualmente (p. ej. desvalidar una factura marcada por error).
  async function changeStatus(estado: string) {
    if (!estado || estado === invoice.estado) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/organizations/${orgId}/invoices/${invoice.id}/estado`, {
        method: 'PATCH',
        body: { estado },
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado');
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Revisar factura</h2>
        <span className="badge">{ESTADO_LABELS[invoice.estado] ?? invoice.estado}</span>
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

      {/* Split view: imagen fija a la izquierda, formulario a la derecha (se apila en móvil). */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div
          style={{
            flex: '1 1 320px',
            minWidth: 280,
            position: 'sticky',
            top: 0,
            maxHeight: '78vh',
            overflowY: 'auto',
          }}
        >
          {imageUrls === null ? (
            <p className="muted">Cargando imagen…</p>
          ) : imageUrls.length === 0 ? (
            <p className="muted">Sin imagen.</p>
          ) : (
            <>
              {imageUrls.length > 1 && (
                <p className="muted" style={{ marginTop: 0 }}>
                  {imageUrls.length} páginas · clic para ampliar
                </p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {imageUrls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" title="Ver imagen completa">
                    <img
                      src={url}
                      alt={`Página ${i + 1} de la factura`}
                      style={{
                        width: '100%',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        display: 'block',
                      }}
                    />
                  </a>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ flex: '2 1 440px', minWidth: 320 }}>
      <div className="row" style={{ alignItems: 'center', marginBottom: 12 }}>
        <div>
          <label style={{ margin: '0 0 4px' }}>Cambiar estado (corregir error)</label>
          <select
            value=""
            onChange={(e) => changeStatus(e.target.value)}
            disabled={busy}
          >
            <option value="">Mover a…</option>
            <option value="en_revision">En revisión</option>
            <option value="validada">Validada</option>
            <option value="rechazada">Rechazada</option>
          </select>
        </div>
        <div style={{ flex: 2 }} />
      </div>

      {invoice.confianzaPorCampo?.error && (
        <div className="notice">OCR: {invoice.confianzaPorCampo.error}</div>
      )}
      {marcados.size > 0 && (
        <div className="notice">
          La IA marcó como dudosos: {[...marcados].map(campoLabel).join(', ')}. Verifícalos contra la
          imagen.
        </div>
      )}
      {invoice.validacionDgii && invoice.validacionDgii.alertas.length > 0 && (
        <div className="error">
          <strong>Revisa antes de reportar a la DGII:</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {invoice.validacionDgii.alertas.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {invoice.validacionDgii?.ok && (
        <p style={{ color: 'var(--ok)', fontSize: 14, margin: '12px 0' }}>
          ✓ NCF, RNC y padrón DGII verificados
        </p>
      )}
      {invoice.validacionDgii?.ecf?.verificado && invoice.validacionDgii.ecf.aceptado && (
        <p style={{ color: 'var(--ok)', fontSize: 14, margin: '4px 0 12px' }}>
          ✓ e-CF verificado en vivo con la DGII (Aceptado)
        </p>
      )}
      {error && <div className="error">{error}</div>}

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
        <>
          {selectField('Empresa (cliente)', 'clientProfileId', [
            { value: '', label: '— Sin asignar —' },
            ...clientes.map((c) => ({ value: c.id, label: c.razonSocial })),
          ])}

          <div className="row">
            <div>
              <label style={marcados.has('rnc_proveedor') ? { color: 'var(--warning-text)' } : undefined}>
                RNC / Cédula del proveedor{marcados.has('rnc_proveedor') ? ' ⚠' : ''}
              </label>
              <input value={form.rncProveedor} onChange={set('rncProveedor')} />
            </div>
            {selectField('Tipo de documento', 'tipoIdProveedor', [
              { value: '', label: 'Automático (por longitud)' },
              { value: '1', label: '1 · RNC (9 dígitos)' },
              { value: '2', label: '2 · Cédula (11 dígitos)' },
            ])}
          </div>

          <label>Razón social del proveedor</label>
          <input value={form.razonSocialProveedor} onChange={set('razonSocialProveedor')} />

          <div className="row">
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
          </div>

          <div className="row">
            {textField('NCF', 'ncf', 'B0100000001')}
            {textField('NCF modificado (nota créd./déb.)', 'ncfModificado')}
          </div>

          <div className="row">
            <div>
              <label style={marcados.has('fecha') ? { color: 'var(--warning-text)' } : undefined}>
                Fecha comprobante (AAAA-MM-DD){marcados.has('fecha') ? ' ⚠' : ''}
              </label>
              <input value={form.fecha} onChange={set('fecha')} placeholder="2026-05-14" />
            </div>
            {textField('Fecha de pago (AAAA-MM-DD)', 'fechaPago', 'opcional')}
          </div>

          <div className="row">
            {numField('Monto facturado (subtotal)', 'montoFacturado', 'monto_facturado')}
            {numField('ITBIS facturado', 'itbis', 'itbis')}
          </div>

          <div className="row">
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
            <div>
              <label>Total impreso (verifica aritmética)</label>
              <input value={form.montoTotal} onChange={set('montoTotal')} inputMode="decimal" />
              <p className="muted" style={{ marginTop: 4 }}>
                Suma calculada (subtotal + ITBIS + propina):{' '}
                <strong>{sumaCalculada.toFixed(2)}</strong>
                {form.montoTotal !== '' &&
                  Math.abs(sumaCalculada - Number(form.montoTotal)) > 0.01 && (
                    <span style={{ color: 'var(--danger)' }}> · no coincide</span>
                  )}
              </p>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Columnas avanzadas del 606. Déjalas en blanco si no aplican.
          </p>
          <div className="row">
            {numField('ITBIS retenido', 'itbisRetenido')}
            {numField('ITBIS proporcionalidad (Art. 349)', 'itbisProporcionalidad')}
          </div>
          <div className="row">
            {numField('ITBIS llevado al costo', 'itbisCosto')}
            {numField('ITBIS percibido', 'itbisPercibido')}
          </div>
          <div className="row">
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
          </div>
          <div className="row">
            {numField('ISR percibido', 'isrPercibido')}
            {numField('Impuesto selectivo al consumo', 'impuestoSelectivo')}
          </div>
          <div className="row">
            {numField('Otros impuestos / tasas', 'otrosImpuestos')}
            {numField('Propina legal', 'propinaLegal')}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <button className="secondary" onClick={() => guardar(true)} disabled={busy}>
          Guardar
        </button>
        <button className="secondary" onClick={guardarYValidar} disabled={busy}>
          Guardar y validar
        </button>
        {haySiguiente && (
          <button onClick={validarYSiguiente} disabled={busy} title="⌘/Ctrl + Enter">
            {busy ? 'Guardando…' : 'Validar y siguiente →'}
          </button>
        )}
        {!haySiguiente && (
          <button onClick={guardarYValidar} disabled={busy} title="⌘/Ctrl + Enter">
            {busy ? 'Guardando…' : 'Validar y cerrar'}
          </button>
        )}
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        <strong>Guardar</strong>: guarda el avance sin validar. <strong>Validar y siguiente</strong>{' '}
        (⌘/Ctrl+Enter): valida y salta a la próxima factura sin cerrar. Para validar, los campos
        críticos deben estar completos (y la aritmética cuadrar, si está activada).
      </p>
        </div>
      </div>
    </div>
  );
}
