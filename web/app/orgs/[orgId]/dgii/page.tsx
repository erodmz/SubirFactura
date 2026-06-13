'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { api, apiDownload } from '../../../../lib/api';
import type { Preview606 } from '../../../../lib/types';

function periodoActual(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
}

interface CierreResult {
  periodo: string;
  cantidadRegistros: number;
  incluidas: number;
  omitidas: { id: string; razon: string }[];
  nombreArchivo: string;
}

export default function DgiiPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [periodo, setPeriodo] = useState(periodoActual());
  const [preview, setPreview] = useState<Preview606 | null>(null);
  const [cierre, setCierre] = useState<CierreResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const validPeriodo = /^\d{6}$/.test(periodo);

  async function doPreview() {
    setBusy(true);
    setError('');
    setCierre(null);
    try {
      setPreview(
        await api<Preview606>(`/api/organizations/${orgId}/dgii/606/preview?periodo=${periodo}`),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function doDownload() {
    setError('');
    try {
      await apiDownload(
        `/api/organizations/${orgId}/dgii/606?periodo=${periodo}`,
        `DGII_F_606_${periodo}.TXT`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  async function doCerrar() {
    if (!confirm(`¿Cerrar el período ${periodo}? Las facturas validadas quedarán incluidas en el 606.`))
      return;
    setBusy(true);
    setError('');
    try {
      setCierre(
        await api<CierreResult>(`/api/organizations/${orgId}/dgii/606/cerrar?periodo=${periodo}`, {
          method: 'POST',
        }),
      );
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Reporte 606 (compras de gastos)</h1>
      <p className="muted">
        Genera el archivo de envío del Formato 606 de la DGII a partir de las facturas validadas del
        período.
      </p>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <div className="row">
          <div>
            <label>Período fiscal (AAAAMM)</label>
            <input
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value.trim())}
              placeholder="202605"
              maxLength={6}
            />
          </div>
          <div style={{ flex: '0 0 auto', display: 'flex', gap: 8 }}>
            <button onClick={doPreview} disabled={busy || !validPeriodo}>
              Vista previa
            </button>
            <button className="secondary" onClick={doDownload} disabled={!validPeriodo}>
              Descargar TXT
            </button>
          </div>
        </div>
      </div>

      {preview && (
        <div className="card">
          <h2>Vista previa — {preview.nombreArchivo}</h2>
          <p>
            <strong>{preview.cantidadRegistros}</strong> factura(s) entrarán al 606.
          </p>
          {preview.omitidas.length > 0 ? (
            <div className="notice">
              {preview.omitidas.length} factura(s) del período no se incluyen por datos incompletos:
              <ul>
                {preview.omitidas.map((o) => (
                  <li key={o.id}>
                    {o.id.slice(0, 8)} — {o.razon}
                  </li>
                ))}
              </ul>
              Complétalas en la pestaña Facturas para incluirlas.
            </div>
          ) : (
            <p className="muted">Todas las facturas del período tienen datos completos.</p>
          )}
          <button className="danger" onClick={doCerrar} disabled={busy}>
            Cerrar período e incluir en 606
          </button>
        </div>
      )}

      {cierre && (
        <div className="card">
          <h2>Período {cierre.periodo} cerrado</h2>
          <p>
            <strong>{cierre.incluidas}</strong> factura(s) marcadas como incluidas en el 606.
          </p>
          {cierre.omitidas.length > 0 && (
            <div className="notice">
              {cierre.omitidas.length} quedaron fuera por datos incompletos.
            </div>
          )}
          <button onClick={doDownload}>Descargar TXT</button>
        </div>
      )}
    </>
  );
}
