'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, apiDownload } from '../../../../lib/api';
import type { CierreEstado, PadronAdvertencia, Preview606 } from '../../../../lib/types';

const SEMAFORO: Record<CierreEstado['semaforo'], { color: string; label: string }> = {
  verde: { color: 'var(--ok)', label: 'Listo para cerrar' },
  amarillo: { color: 'var(--m-orange)', label: 'Casi listo — revisa los avisos' },
  rojo: { color: 'var(--danger)', label: 'Aún no se puede cerrar' },
  vacio: { color: 'var(--muted)', label: 'Sin facturas en el período' },
};

function advertenciaTexto(a: PadronAdvertencia): string {
  if (!a.existe) return `RNC ${a.rnc} no figura en el padrón de la DGII`;
  if (!a.activo) return `RNC ${a.rnc} aparece inactivo en el padrón`;
  return `RNC ${a.rnc}: la razón social no coincide con el padrón (oficial: ${a.razonSocialOficial ?? '—'})`;
}

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
  const [estado, setEstado] = useState<CierreEstado | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const validPeriodo = /^\d{6}$/.test(periodo);

  const loadEstado = useCallback(async () => {
    if (!/^\d{6}$/.test(periodo)) {
      setEstado(null);
      return;
    }
    try {
      setEstado(
        await api<CierreEstado>(`/api/organizations/${orgId}/dgii/606/cierre?periodo=${periodo}`),
      );
    } catch {
      setEstado(null);
    }
  }, [orgId, periodo]);

  useEffect(() => {
    loadEstado();
  }, [loadEstado]);

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

  async function doDownloadExcel() {
    setError('');
    try {
      await apiDownload(
        `/api/organizations/${orgId}/dgii/606/excel?periodo=${periodo}`,
        `DGII_F_606_${periodo}.xlsx`,
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
      await loadEstado();
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
            <button className="secondary" onClick={doDownloadExcel} disabled={!validPeriodo}>
              Descargar Excel
            </button>
          </div>
        </div>
      </div>

      {estado && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: SEMAFORO[estado.semaforo].color,
                flexShrink: 0,
              }}
            />
            <h2 style={{ margin: 0 }}>Cierre del período · {SEMAFORO[estado.semaforo].label}</h2>
          </div>

          {estado.semaforo !== 'vacio' && (
            <p
              style={{
                color: estado.vencido || estado.diasRestantes <= 3 ? 'var(--danger)' : 'var(--muted)',
                margin: '0 0 12px',
              }}
            >
              Fecha límite DGII: <strong>{estado.fechaLimite}</strong>{' '}
              {estado.vencido
                ? `· venció hace ${Math.abs(estado.diasRestantes)} día(s)`
                : `· faltan ${estado.diasRestantes} día(s)`}
            </p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <span className="badge">{estado.totales.reportables} listas</span>
            {estado.totales.enRevision > 0 && (
              <span className="badge">{estado.totales.enRevision} en revisión</span>
            )}
            {estado.totales.enProceso > 0 && (
              <span className="badge">{estado.totales.enProceso} procesando</span>
            )}
            {estado.totales.conAlertasDgii > 0 && (
              <span className="badge">{estado.totales.conAlertasDgii} con alertas DGII</span>
            )}
          </div>

          {estado.bloqueos.length > 0 && (
            <div className="error">
              <strong>Falta para poder cerrar:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {estado.bloqueos.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          {estado.avisos.length > 0 && (
            <div className="notice">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {estado.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {estado.listoParaCerrar && (
            <p style={{ color: 'var(--ok)', margin: '8px 0 0' }}>
              ✓ Todo en orden. Usa “Vista previa” y luego cierra el período.
            </p>
          )}
        </div>
      )}

      {preview && (
        <div className="card">
          <h2>Vista previa — {preview.nombreArchivo}</h2>
          <p>
            <strong>{preview.cantidadRegistros}</strong> factura(s) entrarán al 606.
          </p>
          {preview.advertencias.length > 0 && (
            <div className="notice">
              Avisos del padrón RNC (no impiden generar, pero conviene revisar):
              <ul>
                {preview.advertencias.map((a) => (
                  <li key={a.rnc}>{advertenciaTexto(a)}</li>
                ))}
              </ul>
            </div>
          )}
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
