'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../lib/api';
import type { LimitUsage, OrgUsage } from '../../../lib/types';

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
        <p className="muted" style={{ color: '#d97706' }}>
          Cerca del límite del plan — considera mejorar de plan
        </p>
      )}
    </div>
  );
}

export default function OrgDashboard() {
  const { orgId } = useParams<{ orgId: string }>();
  const [usage, setUsage] = useState<OrgUsage | null>(null);
  const [aritmetica, setAritmetica] = useState<boolean | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<OrgUsage>(`/api/organizations/${orgId}/usage`)
      .then(setUsage)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));
    api<{ requiereValidacionAritmetica: boolean }>(`/api/organizations/${orgId}`)
      .then((o) => setAritmetica(o.requiereValidacionAritmetica))
      .catch(() => {});
  }, [orgId]);

  async function toggleAritmetica(value: boolean) {
    setAritmetica(value);
    try {
      await api(`/api/organizations/${orgId}`, {
        method: 'PATCH',
        body: { requiereValidacionAritmetica: value },
      });
    } catch (err) {
      setAritmetica(!value); // revertir si falla
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <>
      <h1>Resumen</h1>
      {error && <div className="error">{error}</div>}
      {usage && (
        <>
          <p>
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

      {aritmetica !== null && (
        <div className="card">
          <h2>Configuración</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={aritmetica}
              onChange={(e) => toggleAritmetica(e.target.checked)}
              style={{ width: 'auto' }}
            />
            <span>
              Exigir validación aritmética (subtotal + impuestos = total) antes de validar una factura
            </span>
          </label>
          <p className="muted" style={{ marginTop: 6 }}>
            Si lo apagas, el contador puede validar aunque los montos no cuadren exactamente.
          </p>
        </div>
      )}
    </>
  );
}
