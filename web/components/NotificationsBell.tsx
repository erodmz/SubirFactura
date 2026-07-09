'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';
import type { CierreEstado } from '../lib/types';

function periodoActual(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

interface Alerta {
  texto: string;
  href: string;
  tono: 'danger' | 'warn' | 'muted';
}

/**
 * Campana de notificaciones. Sin backend de notificaciones dedicado, deriva
 * alertas accionables del estado del 606 del mes en curso (facturas en revisión,
 * sin asignar, y proximidad de la fecha límite). Silencioso para el rol cliente
 * (el endpoint es de admin/contador).
 */
export default function NotificationsBell({ orgId }: { orgId: string }) {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const periodo = periodoActual();
    api<CierreEstado>(`/api/organizations/${orgId}/dgii/606/cierre?periodo=${periodo}`)
      .then((c) => {
        const base = `/orgs/${orgId}`;
        const items: Alerta[] = [];
        if (c.totales.enRevision > 0)
          items.push({
            texto: `${c.totales.enRevision} factura(s) esperan revisión`,
            href: `${base}/invoices?estado=en_revision`,
            tono: 'danger',
          });
        if (c.totales.sinAsignar > 0)
          items.push({
            texto: `${c.totales.sinAsignar} factura(s) sin asignar a un cliente`,
            href: `${base}/invoices`,
            tono: 'warn',
          });
        if (!c.vencido && c.diasRestantes <= 7 && c.totales.reportables > 0)
          items.push({
            texto: `El 606 de ${MESES[Number(periodo.slice(4, 6)) - 1]} vence en ${c.diasRestantes} día(s)`,
            href: `${base}/dgii`,
            tono: 'warn',
          });
        if (c.vencido && c.totales.reportables > 0)
          items.push({
            texto: `El 606 de ${MESES[Number(periodo.slice(4, 6)) - 1]} venció hace ${Math.abs(c.diasRestantes)} día(s)`,
            href: `${base}/dgii`,
            tono: 'danger',
          });
        setAlertas(items);
      })
      .catch(() => setAlertas([]));
  }, [orgId]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="notif" ref={ref}>
      <button
        className="notif-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notificaciones${alertas.length ? ` (${alertas.length})` : ''}`}
        title="Notificaciones"
      >
        🔔
        {alertas.length > 0 && <span className="notif-badge">{alertas.length}</span>}
      </button>
      {open && (
        <div className="notif-dropdown">
          <div className="notif-head">Notificaciones</div>
          {alertas.length === 0 ? (
            <p className="muted" style={{ padding: '10px 12px', margin: 0 }}>
              Todo al día. Sin pendientes.
            </p>
          ) : (
            alertas.map((a, i) => (
              <Link
                key={i}
                href={a.href}
                className="notif-item"
                onClick={() => setOpen(false)}
              >
                <span className={`notif-dot notif-${a.tono}`} aria-hidden />
                {a.texto}
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
