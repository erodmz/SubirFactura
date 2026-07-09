'use client';

import { useState } from 'react';
import { api } from '../lib/api';

interface Evento {
  accion: string;
  fecha: string;
  usuario: { nombre: string | null; email: string } | null;
  datos: unknown;
}

const ESTADO_LABEL: Record<string, string> = {
  subida: 'Subida',
  procesando: 'Procesando',
  extraida: 'Extraída',
  en_revision: 'En revisión',
  validada: 'Validada',
  incluida_en_606: 'En 606',
  reportada: 'Reportada',
  rechazada: 'Rechazada',
  duplicada: 'Duplicada',
};

/** Descripción, icono y tono de cada evento del audit_log. */
function describe(e: Evento): { titulo: string; detalle?: string; icon: string; tono: string } {
  const d = (e.datos ?? {}) as Record<string, unknown>;
  switch (e.accion) {
    case 'invoice.upload':
      return { titulo: 'Factura subida al sistema', icon: '↑', tono: 'var(--m-blue)' };
    case 'invoice.review':
      return d.validar === true
        ? { titulo: 'Factura validada', icon: '✓', tono: 'var(--ok)' }
        : { titulo: 'Datos editados', icon: '✎', tono: 'var(--m-purple)' };
    case 'invoice.change_status':
      return {
        titulo: 'Cambio de estado',
        detalle: `${ESTADO_LABEL[String(d.de)] ?? d.de} → ${ESTADO_LABEL[String(d.a)] ?? d.a}`,
        icon: '⇄',
        tono: 'var(--m-orange)',
      };
    case 'invoice.retry_ocr':
      return { titulo: 'Reprocesada con IA', icon: '⟳', tono: 'var(--m-blue)' };
    default:
      return { titulo: e.accion, icon: '•', tono: 'var(--muted)' };
  }
}

function fechaLarga(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-DO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function InvoiceTimeline({ orgId, invoiceId }: { orgId: string; invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && eventos === null && !loading) {
      setLoading(true);
      try {
        setEventos(await api<Evento[]>(`/api/organizations/${orgId}/invoices/${invoiceId}/historial`));
      } catch {
        setEventos([]);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="tl-wrap">
      <button type="button" className="tl-toggle" onClick={toggle} aria-expanded={open}>
        <span className="tl-toggle-icon" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>
          ▸
        </span>
        Historial y trazabilidad
      </button>
      {open && (
        <div className="tl-panel">
          {loading ? (
            <p className="muted" style={{ margin: 0 }}>
              Cargando…
            </p>
          ) : !eventos || eventos.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Sin eventos registrados.
            </p>
          ) : (
            <ol className="timeline">
              {eventos.map((e, i) => {
                const { titulo, detalle, icon, tono } = describe(e);
                return (
                  <li className="tl-item" key={i}>
                    <span className="tl-dot" style={{ background: tono }} aria-hidden>
                      {icon}
                    </span>
                    <div className="tl-body">
                      <div className="tl-title">{titulo}</div>
                      {detalle && <div className="tl-detail">{detalle}</div>}
                      <div className="tl-meta">
                        {e.usuario ? e.usuario.nombre || e.usuario.email : 'Sistema'} ·{' '}
                        {fechaLarga(e.fecha)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
