'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';

/**
 * Registro MANUAL de un gasto — para cuando no hay comprobante que fotografiar
 * (o se perdió). Si hay foto, mejor subirla por el flujo normal: la IA la lee.
 * Entra en revisión; si el cliente exige aprobación, en revisión SIEMPRE.
 */
export default function ManualInvoiceModal({
  orgId,
  clientes,
  clienteFijo,
  puedeValidar,
  onClose,
  onCreated,
}: {
  orgId: string;
  /** Lista para el selector (contador). Vacía si clienteFijo. */
  clientes: { id: string; razonSocial: string }[];
  /** Cliente fijo (vista del dueño de negocio con un solo negocio). */
  clienteFijo?: string;
  /** Si quien registra puede validar al guardar (contador / cliente de confianza). */
  puedeValidar?: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    clientProfileId: clienteFijo ?? '',
    rncProveedor: '',
    razonSocialProveedor: '',
    ncf: '',
    fecha: '',
    montoFacturado: '',
    itbis: '',
    montoTotal: '',
  });
  const [validar, setValidar] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setAviso('');
    if (!form.clientProfileId) return setError('Indica a qué negocio pertenece el gasto');
    setBusy(true);
    try {
      const res = await api<{ estado: string; aprobacionRequerida?: boolean }>(
        `/api/organizations/${orgId}/invoices/manual`,
        {
          method: 'POST',
          body: {
            clientProfileId: form.clientProfileId,
            rncProveedor: form.rncProveedor.trim() || undefined,
            razonSocialProveedor: form.razonSocialProveedor.trim() || undefined,
            ncf: form.ncf.trim() || undefined,
            fecha: form.fecha || undefined,
            montoFacturado: num(form.montoFacturado),
            itbis: num(form.itbis),
            montoTotal: num(form.montoTotal),
            validar: validar || undefined,
          },
        },
      );
      if (res.aprobacionRequerida) {
        setAviso('Este negocio exige aprobación: el gasto quedó en revisión.');
        setTimeout(() => {
          onCreated();
          onClose();
        }, 1600);
      } else {
        onCreated();
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
      setBusy(false);
    }
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10, 12, 24, 0.55)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '48px 16px',
        overflowY: 'auto',
        zIndex: 50,
      }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ width: 'min(560px, 100%)', margin: 0 }}
      >
        <h2>Registrar gasto a mano ✍️</h2>
        <p className="muted" style={{ marginTop: -4 }}>
          ¿Tienes el comprobante a mano? Mejor súbele una foto y la IA lo lee. Esto es para
          cuando no hay nada que fotografiar.
        </p>
        {error && <div className="error">{error}</div>}
        {aviso && <p style={{ color: 'var(--accent, #6c7cff)', fontWeight: 600 }}>{aviso}</p>}
        <form onSubmit={guardar}>
          {!clienteFijo && (
            <>
              <label>Negocio (cliente)</label>
              <select value={form.clientProfileId} onChange={set('clientProfileId')} required>
                <option value="">— Elige el negocio —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.razonSocial}
                  </option>
                ))}
              </select>
            </>
          )}
          <div className="row">
            <div>
              <label>RNC del proveedor</label>
              <input value={form.rncProveedor} onChange={set('rncProveedor')} placeholder="101000001" />
            </div>
            <div>
              <label>NCF</label>
              <input value={form.ncf} onChange={set('ncf')} placeholder="B0100000001" />
            </div>
          </div>
          <label>Nombre del proveedor (opcional)</label>
          <input value={form.razonSocialProveedor} onChange={set('razonSocialProveedor')} />
          <div className="row">
            <div>
              <label>Fecha</label>
              <input type="date" value={form.fecha} onChange={set('fecha')} />
            </div>
            <div>
              <label>Subtotal (sin ITBIS)</label>
              <input type="number" step="0.01" min="0" value={form.montoFacturado} onChange={set('montoFacturado')} />
            </div>
          </div>
          <div className="row">
            <div>
              <label>ITBIS</label>
              <input type="number" step="0.01" min="0" value={form.itbis} onChange={set('itbis')} />
            </div>
            <div>
              <label>Total (como en el comprobante)</label>
              <input type="number" step="0.01" min="0" value={form.montoTotal} onChange={set('montoTotal')} />
            </div>
          </div>
          {puedeValidar && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <input
                type="checkbox"
                checked={validar}
                onChange={(e) => setValidar(e.target.checked)}
                style={{ width: 'auto' }}
              />
              Validar al guardar (exige NCF, RNC, fecha, montos y que cuadren)
            </label>
          )}
          <p className="muted" style={{ fontSize: '.82rem' }}>
            Puedes guardar con lo que tengas: queda en revisión y el contador la completa.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={busy}>{busy ? 'Guardando…' : 'Guardar gasto'}</button>
            <button type="button" className="secondary" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
