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
                  <td>{inv.clientProfile?.razonSocial ?? '—'}</td>
                  <td>{inv.razonSocialProveedor ?? '—'}</td>
                  <td>{inv.ncf ?? '—'}</td>
                  <td>{fechaCorta(inv.fecha) || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{money(inv.montoFacturado)}</td>
                  <td>
                    <span className="badge">{ESTADO_LABELS[inv.estado] ?? inv.estado}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <a
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
                    >
                      {expanded === inv.id ? 'Cerrar' : 'Revisar'}
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
        return sel ? (
          <ReviewPanel
            orgId={orgId}
            invoice={sel}
            onSaved={() => {
              setExpanded(null);
              load();
            }}
          />
        ) : null;
      })()}
    </>
  );
}

function ReviewPanel({
  orgId,
  invoice,
  onSaved,
}: {
  orgId: string;
  invoice: Invoice;
  onSaved: () => void;
}) {
  const marcados = dudosos(invoice);
  const [form, setForm] = useState({
    ncf: invoice.ncf ?? '',
    rncProveedor: invoice.rncProveedor ?? '',
    razonSocialProveedor: invoice.razonSocialProveedor ?? '',
    fecha: fechaCorta(invoice.fecha),
    montoFacturado: invoice.montoFacturado?.toString() ?? '',
    itbis: invoice.itbis?.toString() ?? '',
    propinaLegal: invoice.propinaLegal?.toString() ?? '',
    montoTotal: '',
    categoria606: invoice.categoria606 ?? '',
  });
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

  async function save() {
    setBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        ncf: form.ncf || undefined,
        rncProveedor: form.rncProveedor || undefined,
        razonSocialProveedor: form.razonSocialProveedor || undefined,
        fecha: form.fecha || undefined,
        categoria606: form.categoria606 || undefined,
      };
      for (const k of ['montoFacturado', 'itbis', 'propinaLegal', 'montoTotal'] as const) {
        if (form[k] !== '') body[k] = Number(form[k]);
      }
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

  return (
    <div className="card">
      <h2>Revisar factura</h2>
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
      {error && <div className="error">{error}</div>}

      <div className="row">
        <div>
          <label style={marcados.has('ncf') ? { color: '#d97706' } : undefined}>
            NCF{marcados.has('ncf') ? ' ⚠' : ''}
          </label>
          <input value={form.ncf} onChange={set('ncf')} />
        </div>
        <div>
          <label style={marcados.has('rnc_proveedor') ? { color: '#d97706' } : undefined}>
            RNC proveedor{marcados.has('rnc_proveedor') ? ' ⚠' : ''}
          </label>
          <input value={form.rncProveedor} onChange={set('rncProveedor')} />
        </div>
      </div>

      <label>Razón social del proveedor</label>
      <input value={form.razonSocialProveedor} onChange={set('razonSocialProveedor')} />

      <div className="row">
        <div>
          <label style={marcados.has('fecha') ? { color: '#d97706' } : undefined}>
            Fecha (AAAA-MM-DD){marcados.has('fecha') ? ' ⚠' : ''}
          </label>
          <input value={form.fecha} onChange={set('fecha')} placeholder="2026-05-14" />
        </div>
        <div>
          <label>Categoría 606</label>
          <select value={form.categoria606} onChange={set('categoria606')}>
            <option value="">Sin asignar</option>
            {Object.entries(CATEGORIAS_606).map(([code, nombre]) => (
              <option key={code} value={code}>
                {code} — {nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="row">
        {numField('Monto facturado (subtotal)', 'montoFacturado', 'monto_facturado')}
        {numField('ITBIS', 'itbis', 'itbis')}
      </div>
      <div className="row">
        {numField('Propina legal', 'propinaLegal')}
        <div>
          <label>Total impreso (verifica aritmética)</label>
          <input value={form.montoTotal} onChange={set('montoTotal')} inputMode="decimal" />
        </div>
      </div>

      <button onClick={save} disabled={busy}>
        {busy ? 'Guardando…' : 'Guardar y validar'}
      </button>
      <p className="muted" style={{ marginTop: 8 }}>
        Si los campos críticos quedan completos y la aritmética cuadra, la factura pasa a “Validada”.
      </p>
    </div>
  );
}
