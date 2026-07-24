'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { CATEGORIAS_606 } from '../lib/types';
import Toggle from './Toggle';
import SuccessCheck from './SuccessCheck';

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
    categoria606: '',
    formaPago: '',
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
            categoria606: form.categoria606 || undefined,
            formaPago: form.formaPago || undefined,
            validar: validar || undefined,
          },
        },
      );
      // Un respiro con el check dibujándose antes de cerrar: se SIENTE guardado.
      setAviso(
        res.aprobacionRequerida
          ? 'Este negocio exige aprobación: el gasto quedó en revisión.'
          : res.estado === 'validada'
            ? 'Gasto registrado y validado.'
            : 'Gasto registrado — quedó en revisión.',
      );
      setTimeout(
        () => {
          onCreated();
          onClose();
        },
        res.aprobacionRequerida ? 1600 : 900,
      );
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
        {aviso && (
          <p
            className="anim-pop"
            style={{
              color: 'var(--ok)',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <SuccessCheck />
            {aviso}
          </p>
        )}
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
          <div className="row">
            <div>
              <label>Categoría del gasto (606)</label>
              <select value={form.categoria606} onChange={set('categoria606')}>
                <option value="">— Sin clasificar —</option>
                {Object.entries(CATEGORIAS_606).map(([codigo, nombre]) => (
                  <option key={codigo} value={codigo}>
                    {codigo} · {nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Forma de pago</label>
              <select value={form.formaPago} onChange={set('formaPago')}>
                <option value="">— Sin especificar —</option>
                <option value="1">1 · Efectivo</option>
                <option value="2">2 · Cheque / transferencia</option>
                <option value="3">3 · Tarjeta crédito/débito</option>
                <option value="4">4 · Compra a crédito</option>
                <option value="5">5 · Permuta</option>
                <option value="6">6 · Nota de crédito</option>
                <option value="7">7 · Mixto / otras</option>
              </select>
            </div>
          </div>
          {puedeValidar && (
            <div style={{ marginTop: 8 }}>
              <Toggle
                checked={validar}
                onChange={setValidar}
                label="Validar al guardar (exige NCF, RNC, fecha, montos y que cuadren)"
              />
              {/* Una factura validada SIN categoría queda verde pero el 606 la
                  omite en silencio: avisamos aquí en vez de en el cierre. */}
              {validar && !form.categoria606 && (
                <p className="muted" style={{ fontSize: '.8rem', marginTop: 6 }}>
                  Sin categoría, esta factura no entrará al 606 aunque quede validada.
                  Elige una arriba para que se reporte.
                </p>
              )}
            </div>
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
