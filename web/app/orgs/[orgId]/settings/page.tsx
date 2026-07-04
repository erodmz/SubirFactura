'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, apiUpload } from '../../../../lib/api';

export default function OrgSettingsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [aritmetica, setAritmetica] = useState<boolean | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ requiereValidacionAritmetica: boolean; logoUrl: string | null }>(
      `/api/organizations/${orgId}`,
    )
      .then((o) => {
        setAritmetica(o.requiereValidacionAritmetica);
        setLogoUrl(o.logoUrl);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));
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
      setAritmetica(!value);
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <>
      <h1>Configuración de la empresa</h1>
      {error && <div className="error">{error}</div>}

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
      </div>

      <div className="card">
        <h2>Revisión de facturas</h2>
        {aritmetica !== null && (
          <>
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
          </>
        )}
      </div>
    </>
  );
}
