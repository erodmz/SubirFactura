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
  const [error, setError] = useState('');

  useEffect(() => {
    api<OrgUsage>(`/api/organizations/${orgId}/usage`)
      .then(setUsage)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));
  }, [orgId]);

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
    </>
  );
}
