'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, apiUpload, apiUrl } from '../../../../lib/api';
import Toggle from '../../../../components/Toggle';
import type { PlanInfo } from '../../../../lib/types';

interface LimitUsage {
  used: number;
  max: number;
  warning: boolean;
}
interface OrgUsage {
  plan: { nombre: string } | null;
  estadoSuscripcion: string | null;
  contadores: LimitUsage | null;
  clientes: LimitUsage | null;
  facturasMes: LimitUsage | null;
}

const fmtRD = (n: number) => (n === 0 ? 'Gratis' : `RD$${n.toLocaleString('es-DO')}/mes`);

export default function OrgSettingsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [aritmetica, setAritmetica] = useState<boolean | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState('');

  const [usage, setUsage] = useState<OrgUsage | null>(null);
  const [planes, setPlanes] = useState<PlanInfo[]>([]);
  const [changingPlan, setChangingPlan] = useState('');
  const [planMsg, setPlanMsg] = useState('');

  const loadUsage = useCallback(() => {
    api<OrgUsage>(`/api/organizations/${orgId}/usage`).then(setUsage).catch(() => {});
  }, [orgId]);

  useEffect(() => {
    api<{ requiereValidacionAritmetica: boolean; logoUrl: string | null }>(
      `/api/organizations/${orgId}`,
    )
      .then((o) => {
        setAritmetica(o.requiereValidacionAritmetica);
        setLogoUrl(o.logoUrl);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));
    loadUsage();
    api<PlanInfo[]>('/api/plans').then(setPlanes).catch(() => {});
  }, [orgId, loadUsage]);

  async function changePlan(nombre: string) {
    setError('');
    setPlanMsg('');
    setChangingPlan(nombre);
    try {
      await api(`/api/organizations/${orgId}/plan`, {
        method: 'POST',
        body: { planNombre: nombre },
      });
      const elegido = planes.find((p) => p.nombre === nombre);
      setPlanMsg(
        elegido && Number(elegido.precio) > 0
          ? `¡Ya estás en el plan ${nombre}! Te contactaremos para coordinar el pago por transferencia.`
          : `¡Ya estás en el plan ${nombre}!`,
      );
      loadUsage();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setChangingPlan('');
    }
  }

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
      setAritmetica(!value);
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <>
      <h1>Configuración de la empresa</h1>
      {error && <div className="error">{error}</div>}

      {usage && (
        <div className="card" data-tour="plan">
          <h2>Tu plan y consumo</h2>
          {planMsg && (
            <p style={{ color: 'var(--ok, #34d399)', fontWeight: 600 }}>{planMsg}</p>
          )}
          <p className="muted" style={{ marginTop: 0 }}>
            Plan actual: <strong>{usage.plan?.nombre ?? '—'}</strong>
            {usage.estadoSuscripcion && usage.estadoSuscripcion !== 'activa' && (
              <span className="badge" style={{ marginLeft: 8 }}>{usage.estadoSuscripcion}</span>
            )}
          </p>
          {([
            ['Contadores', usage.contadores],
            ['Clientes', usage.clientes],
            ['Facturas este mes', usage.facturasMes],
          ] as const).map(([titulo, u]) =>
            u ? (
              <div key={titulo} style={{ margin: '10px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.9rem' }}>
                  <span>{titulo}</span>
                  <span className={u.warning ? '' : 'muted'}>
                    {u.used.toLocaleString('es-DO')} / {u.max.toLocaleString('es-DO')}
                    {u.warning && ' ⚠️'}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={u.used}
                  aria-valuemax={u.max}
                  aria-label={titulo}
                  style={{
                    height: 6,
                    borderRadius: 3,
                    background: 'var(--bg-soft)',
                    border: '1px solid var(--border)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, (u.used / Math.max(1, u.max)) * 100)}%`,
                      height: '100%',
                      background: u.warning ? '#fbbf24' : 'var(--accent, #6c7cff)',
                    }}
                  />
                </div>
              </div>
            ) : null,
          )}

          {planes.length > 0 && (
            <>
              <h3 style={{ marginTop: 18 }}>Cambiar de plan</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
                {planes.map((p) => {
                  const actual = usage.plan?.nombre === p.nombre;
                  return (
                    <div
                      key={p.nombre}
                      className="card"
                      style={{
                        margin: 0,
                        border: actual ? '2px solid var(--accent, #6c7cff)' : undefined,
                      }}
                    >
                      <strong>{p.nombre}</strong>
                      <div style={{ fontWeight: 700, margin: '4px 0' }}>{fmtRD(Number(p.precio))}</div>
                      <p className="muted" style={{ fontSize: '.82rem', margin: '4px 0 10px' }}>
                        {p.maxContadores} contador{p.maxContadores === 1 ? '' : 'es'} · {p.maxClientes}{' '}
                        clientes · {p.maxFacturasMes.toLocaleString('es-DO')} fact./mes
                      </p>
                      {actual ? (
                        <span className="badge">Tu plan actual</span>
                      ) : (
                        <button
                          type="button"
                          className="secondary"
                          disabled={changingPlan !== ''}
                          onClick={() => changePlan(p.nombre)}
                        >
                          {changingPlan === p.nombre ? 'Cambiando…' : `Cambiar a ${p.nombre}`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="muted" style={{ fontSize: '.82rem', marginTop: 10 }}>
                Los planes pagos se activan al instante; el pago se coordina por transferencia
                (te contactamos). Sin tarjeta.
              </p>
            </>
          )}
        </div>
      )}

      <div className="card">
        <h2>Logo de la empresa</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '6px 0 4px' }}>
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
              <img src={apiUrl(logoUrl)} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
      </div>

      <div className="card">
        <h2>Revisión de facturas</h2>
        {aritmetica !== null && (
          <>
            <Toggle
              checked={aritmetica}
              onChange={toggleAritmetica}
              label="Exigir validación aritmética (subtotal + impuestos = total) antes de validar una factura"
            />
            <p className="muted" style={{ marginTop: 6 }}>
              Si lo apagas, el contador puede validar aunque los montos no cuadren exactamente.
            </p>
          </>
        )}
      </div>
    </>
  );
}
