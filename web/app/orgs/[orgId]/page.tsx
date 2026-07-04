'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, apiUpload } from '../../../lib/api';
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
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<OrgUsage>(`/api/organizations/${orgId}/usage`)
      .then(setUsage)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));
    api<{ requiereValidacionAritmetica: boolean; logoUrl: string | null }>(
      `/api/organizations/${orgId}`,
    )
      .then((o) => {
        setAritmetica(o.requiereValidacionAritmetica);
        setLogoUrl(o.logoUrl);
      })
      .catch(() => {});
  }, [orgId]);

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { logoUrl } = await apiUpload<{ logoUrl: string }>(
        `/api/organizations/${orgId}/logo`,
        fd,
      );
      setLogoUrl(logoUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el logo');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  }

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

          <label>Logo de la empresa</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '6px 0 18px' }}>
            <span
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--bg-soft)',
                display: 'grid',
                placeItems: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span className="muted" style={{ fontSize: 22 }}>🏢</span>
              )}
            </span>
            <div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={uploadLogo}
                disabled={uploadingLogo}
                style={{ width: 'auto', border: 'none', padding: 0 }}
              />
              <p className="muted" style={{ marginTop: 4 }}>
                {uploadingLogo ? 'Subiendo…' : 'PNG, JPG o WebP · hasta 2 MB. Se muestra en la lista de empresas.'}
              </p>
            </div>
          </div>

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
