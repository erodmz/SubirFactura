'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
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
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clientes, setClientes] = useState<{ id: string; razonSocial: string }[]>([]);
  const [clientId, setClientId] = useState<string>('');
  const [estado, setEstado] = useState<string>('en_revision');
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
    const q = params.toString() ? `?${params}` : '';
    api<Invoice[]>(`/api/organizations/${orgId}/invoices${q}`)
      .then(setInvoices)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false));
  }, [orgId, estado, clientId]);

  useEffect(load, [load]);

  const term = busqueda.trim().toLowerCase();
  const visibles = term
    ? invoices.filter((i) =>
        [i.razonSocialProveedor, i.ncf, i.clientProfile?.razonSocial]
          .some((f) => (f ?? '').toLowerCase().includes(term)),
      )
    : invoices;

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
              <option value="">Todas</option>
              {ESTADOS.map((s) => (
                <option key={s} value={s}>
                  {ESTADO_LABELS[s]}
                </option>
              ))}
            </select>
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
          </table>
        )}
      </div>

      {(() => {
        const sel = expanded ? invoices.find((i) => i.id === expanded) : undefined;
        if (!sel) return null;
        return (
          <div
            onClick={() => setExpanded(null)}
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
            <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 760 }}>
              <ReviewPanel
                orgId={orgId}
                invoice={sel}
                clientes={clientes}
                onClose={() => setExpanded(null)}
                onSaved={() => {
                  setExpanded(null);
                  load();
                }}
              />
            </div>
          </div>
        );
      })()}
    </>
  );
}

function ReviewPanel({
  orgId,
  invoice,
  clientes,
  onSaved,
  onClose,
}: {
  orgId: string;
  invoice: Invoice;
  clientes: { id: string; razonSocial: string }[];
  onSaved: () => void;
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
  const [imageUrls, setImageUrls] = useState<string[] | null>(null);

  useEffect(() => {
    api<{ imageUrl?: string; imageUrls?: string[] }>(
      `/api/organizations/${orgId}/invoices/${invoice.id}`,
    )
      .then((d) => setImageUrls(d.imageUrls ?? (d.imageUrl ? [d.imageUrl] : [])))
      .catch(() => {});
  }, [orgId, invoice.id]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const numField = (label: string, key: keyof typeof form, critical?: string) => (
    <div>
      <label style={marcados.has(critical ?? '') ? { color: '#d97706' } : undefined}>
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

  // validar: pasar a "validada". soloValidar: no reenviar ediciones, validar lo guardado.
  async function save(validar: boolean, soloValidar = false) {
    setBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = {};
      if (!soloValidar) {
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
      }
      body.validar = validar;
      await api(`/api/organizations/${orgId}/invoices/${invoice.id}/review`, {
        method: 'PATCH',
        body,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setBusy(false);
    }
  }

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Revisar factura</h2>
        <span className="badge">{ESTADO_LABELS[invoice.estado] ?? invoice.estado}</span>
        <button
          type="button"
          className="secondary"
          onClick={onClose}
          style={{ margin: 0, padding: '4px 12px' }}
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>

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

      {imageUrls === null ? (
        <p className="muted">Cargando imagen…</p>
      ) : imageUrls.length === 0 ? (
        <p className="muted">Sin imagen.</p>
      ) : (
        <>
          {imageUrls.length > 1 && (
            <p className="muted">{imageUrls.length} páginas · clic para ampliar</p>
          )}
          <div className={imageUrls.length > 1 ? 'invoice-photos' : undefined}>
            {imageUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noreferrer" title="Ver imagen completa">
                <img
                  src={url}
                  alt={`Página ${i + 1} de la factura`}
                  className={imageUrls.length > 1 ? 'invoice-photo invoice-photo-multi' : 'invoice-photo'}
                />
              </a>
            ))}
          </div>
        </>
      )}
      {invoice.confianzaPorCampo?.error && (
        <div className="notice">OCR: {invoice.confianzaPorCampo.error}</div>
      )}
      {marcados.size > 0 && (
        <div className="notice">
          La IA marcó como dudosos: {[...marcados].join(', ')}. Verifícalos contra la imagen.
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
              <label style={marcados.has('rnc_proveedor') ? { color: '#d97706' } : undefined}>
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
              <label style={marcados.has('fecha') ? { color: '#d97706' } : undefined}>
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
        <button className="secondary" onClick={() => save(false)} disabled={busy}>
          Guardar
        </button>
        <button className="secondary" onClick={() => save(true, true)} disabled={busy}>
          Validar
        </button>
        <button onClick={() => save(true)} disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar y validar'}
        </button>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        <strong>Guardar</strong>: guarda el avance sin validar · <strong>Validar</strong>: valida lo
        guardado · <strong>Guardar y validar</strong>: guarda tus cambios y valida. Para validar, los
        campos críticos deben estar completos (y la aritmética cuadrar, si está activada).
      </p>
    </div>
  );
}
