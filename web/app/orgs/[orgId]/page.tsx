'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../lib/api';
import type { CierreEstado, LimitUsage, OrgUsage, ResumenGastos } from '../../../lib/types';

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

function UsageCard({ title, usage }: { title: string; usage: LimitUsage | null }) {
  if (!usage) return null;
  const pct = usage.max > 0 ? Math.min(100, Math.round((usage.used / usage.max) * 100)) : 0;
  return (
    <div className="card">
      <h2>{title}</h2>
      <strong style={{ fontSize: 24 }}>
        {usage.used} <span className="muted">/ {usage.max}</span>
      </strong>
      <div className="bar">
        <div className={usage.warning ? 'warn' : ''} style={{ width: `${pct}%` }} />
      </div>
      {usage.warning && (
        <p className="muted" style={{ color: 'var(--warning-text)' }}>
          Cerca del límite del plan — considera mejorar de plan
        </p>
      )}
    </div>
  );
}

const SEMAFORO: Record<CierreEstado['semaforo'], string> = {
  verde: 'var(--ok)',
  amarillo: 'var(--m-orange)',
  rojo: 'var(--danger)',
  vacio: 'var(--muted)',
};

export default function OrgDashboard() {
  const { orgId } = useParams<{ orgId: string }>();
  const periodo = periodoActual();
  const [usage, setUsage] = useState<OrgUsage | null>(null);
  const [cierre, setCierre] = useState<CierreEstado | null>(null);
  const [resumen, setResumen] = useState<ResumenGastos | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<OrgUsage>(`/api/organizations/${orgId}/usage`)
      .then(setUsage)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));
    // Semáforo global del mes en curso (solo admin/contador; el cliente no lo ve).
    api<CierreEstado>(`/api/organizations/${orgId}/dgii/606/cierre?periodo=${periodo}`)
      .then(setCierre)
      .catch(() => {});
    // Analítica de gastos (respeta el alcance por rol en el backend).
    api<ResumenGastos>(`/api/organizations/${orgId}/invoices/resumen?meses=6`)
      .then(setResumen)
      .catch(() => {});
  }, [orgId, periodo]);

  const invUrl = (estado: string) => `/orgs/${orgId}/invoices?estado=${estado}`;
  const maxMes = resumen ? Math.max(1, ...resumen.porMes.map((m) => m.total)) : 1;

  return (
    <>
      <h1>Resumen</h1>
      {error && <div className="error">{error}</div>}

      {/* Panel operativo del mes: qué requiere atención y cuándo vence el 606. */}
      {cierre && (
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
            <Stat
              label="En revisión"
              value={cierre.totales.enRevision}
              href={invUrl('en_revision')}
              danger={cierre.totales.enRevision > 0}
            />
            <Stat label="Procesando" value={cierre.totales.enProceso} href={invUrl('procesando')} />
            <Stat
              label="Listas para el 606"
              value={cierre.totales.reportables}
              href={invUrl('validada')}
              ok={cierre.totales.reportables > 0}
            />
            {cierre.totales.sinAsignar > 0 && (
              <Stat
                label="Sin asignar"
                value={cierre.totales.sinAsignar}
                href={`/orgs/${orgId}/invoices`}
                danger
              />
            )}
            {cierre.totales.conAlertasDgii > 0 && (
              <Stat label="Con alertas DGII" value={cierre.totales.conAlertasDgii} danger />
            )}
          </div>

          <div style={{ marginTop: 14 }}>
            <Link href={`/orgs/${orgId}/dgii`}>Ir al cierre del 606 →</Link>
          </div>
        </div>
      )}

      {/* Analítica de gastos: el valor tangible para el contador y su cliente. */}
      {resumen && resumen.cantidad > 0 && (
        <div className="usage-grid">
          <div className="card">
            <h2>Total gastado (reportado)</h2>
            <strong style={{ fontSize: 26 }}>RD$ {money(resumen.totalGastado)}</strong>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              {resumen.cantidad} factura(s) · ITBIS RD$ {money(resumen.totalItbis)}
            </p>
          </div>

          <div className="card">
            <h2>Gasto por mes</h2>
            {resumen.porMes.length === 0 ? (
              <p className="muted">Sin datos aún.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {resumen.porMes.map((m) => (
                  <div key={m.periodo} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="muted" style={{ width: 64, fontSize: 13 }}>
                      {periodoLabel(m.periodo)}
                    </span>
                    <div className="bar" style={{ flex: 1, margin: 0 }}>
                      <div style={{ width: `${Math.round((m.total / maxMes) * 100)}%` }} />
                    </div>
                    <span style={{ width: 96, textAlign: 'right', fontSize: 13 }}>
                      {money(m.total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2>Top proveedores</h2>
            {resumen.topProveedores.length === 0 ? (
              <p className="muted">Sin datos aún.</p>
            ) : (
              <table style={{ marginTop: 4 }}>
                <tbody>
                  {resumen.topProveedores.map((p) => (
                    <tr key={p.razonSocial}>
                      <td>{p.razonSocial}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        RD$ {money(p.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Uso del plan (lo que ya existía). */}
      {usage && (
        <>
          <p style={{ marginTop: 8 }}>
            Plan <strong>{usage.plan?.nombre ?? 'sin plan'}</strong>{' '}
            <span className="badge">{usage.estadoSuscripcion ?? 'inactiva'}</span>
          </p>
          <div className="usage-grid">
            <UsageCard title="Contadores" usage={usage.contadores} />
            <UsageCard title="Clientes" usage={usage.clientes} />
            <UsageCard title="Facturas este mes" usage={usage.facturasMes} />
          </div>
        </>
      )}
    </>
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
    background: 'var(--surface-2, rgba(127,127,127,0.06))',
  };
  return href ? (
    <Link href={href} style={{ ...style, textDecoration: 'none' }}>
      {inner}
    </Link>
  ) : (
    <div style={style}>{inner}</div>
  );
}
