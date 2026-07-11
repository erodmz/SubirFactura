'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, apiDownload } from '../../../../lib/api';
import type {
  CierreEstado,
  CierreHistorial,
  Client,
  Omitida,
  PadronAdvertencia,
  PanelCierre,
  Preview606,
} from '../../../../lib/types';

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

// El <input type="month"> usa "AAAA-MM"; el resto del código usa "AAAAMM".
const aMonthInput = (p: string) => (/^\d{6}$/.test(p) ? `${p.slice(0, 4)}-${p.slice(4, 6)}` : '');
const deMonthInput = (v: string) => v.replace('-', '');

function money(v: number | null): string {
  if (v == null) return '—';
  return `RD$ ${v.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fechaCorta(iso: string): string {
  return iso.slice(0, 10);
}

interface CierreResult {
  periodo: string;
  cliente: { id: string; razonSocial: string; rnc: string };
  cantidadRegistros: number;
  incluidas: number;
  omitidas: Omitida[];
  nombreArchivo: string;
  montoReportado: number;
  itbisReportado: number;
}

export default function DgiiPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [periodo, setPeriodo] = useState(periodoActual());
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState('');
  const [panel, setPanel] = useState<PanelCierre | null>(null);
  const [historial, setHistorial] = useState<CierreHistorial[]>([]);
  const [preview, setPreview] = useState<Preview606 | null>(null);
  const [cierre, setCierre] = useState<CierreResult | null>(null);
  const [estado, setEstado] = useState<CierreEstado | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Forma de pago elegida para aplicar en lote a las facturas que no la tienen.
  const [bulkFormaPago, setBulkFormaPago] = useState('');

  const validPeriodo = /^\d{6}$/.test(periodo);
  const cliente = clients.find((c) => c.id === clientId) ?? null;
  const listo = validPeriodo && !!clientId;

  useEffect(() => {
    api<Client[]>(`/api/organizations/${orgId}/clients`)
      .then(setClients)
      .catch(() => {});
    api<CierreHistorial[]>(`/api/organizations/${orgId}/dgii/606/historial`)
      .then(setHistorial)
      .catch(() => {});
  }, [orgId]);

  const fileName = (ext: string) => `${periodo}_${cliente?.rncOCedula ?? 'SINRNC'}_F_606.${ext}`;
  const qs = () => `periodo=${periodo}&clientId=${clientId}`;

  // Panel del despacho: el 606 de todos los clientes del período de un vistazo.
  const loadPanel = useCallback(async () => {
    if (!/^\d{6}$/.test(periodo)) {
      setPanel(null);
      return;
    }
    try {
      setPanel(await api<PanelCierre>(`/api/organizations/${orgId}/dgii/606/panel?periodo=${periodo}`));
    } catch {
      setPanel(null);
    }
  }, [orgId, periodo]);

  useEffect(() => {
    loadPanel();
  }, [loadPanel]);

  const loadEstado = useCallback(async () => {
    if (!/^\d{6}$/.test(periodo) || !clientId) {
      setEstado(null);
      return;
    }
    try {
      setEstado(
        await api<CierreEstado>(
          `/api/organizations/${orgId}/dgii/606/cierre?periodo=${periodo}&clientId=${clientId}`,
        ),
      );
    } catch {
      setEstado(null);
    }
  }, [orgId, periodo, clientId]);

  useEffect(() => {
    loadEstado();
  }, [loadEstado]);

  useEffect(() => {
    setPreview(null);
    setCierre(null);
  }, [clientId, periodo]);

  // Destraba el cierre: asigna la forma de pago a todas las validadas que no
  // la tienen (el 606 la requiere y ya no se inventa un default).
  async function aplicarFormaPagoLote() {
    if (!bulkFormaPago) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/organizations/${orgId}/invoices/forma-pago-lote`, {
        method: 'PATCH',
        body: { clientProfileId: clientId, periodoFiscal: periodo, formaPago: bulkFormaPago },
      });
      setBulkFormaPago('');
      await loadEstado();
      await loadPanel();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo asignar la forma de pago');
    } finally {
      setBusy(false);
    }
  }

  async function doPreview() {
    setBusy(true);
    setError('');
    setCierre(null);
    try {
      setPreview(await api<Preview606>(`/api/organizations/${orgId}/dgii/606/preview?${qs()}`));
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
      await apiDownload(`/api/organizations/${orgId}/dgii/606?${qs()}`, fileName('txt'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  async function doDownloadExcel() {
    setError('');
    try {
      await apiDownload(`/api/organizations/${orgId}/dgii/606/excel?${qs()}`, fileName('xlsx'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  async function doDownloadZip() {
    setError('');
    try {
      await apiDownload(
        `/api/organizations/${orgId}/dgii/606/zip?periodo=${periodo}`,
        `606_${periodo}.zip`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  async function doCerrar() {
    // Confirmación consciente: si hay facturas con avisos de la DGII, decirlo
    // explícitamente antes de cerrar (no cerrar a ciegas sobre alertas).
    const conAlertas = estado?.totales.conAlertasDgii ?? 0;
    const aviso =
      conAlertas > 0
        ? `Ojo: ${conAlertas} factura(s) tienen avisos de la DGII (NCF/RNC/padrón). `
        : '';
    if (
      !confirm(
        `${aviso}¿Cerrar el período ${periodo} de ${cliente?.razonSocial ?? 'este cliente'}? Sus facturas validadas quedarán incluidas en el 606.`,
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      setCierre(
        await api<CierreResult>(`/api/organizations/${orgId}/dgii/606/cerrar?${qs()}`, {
          method: 'POST',
        }),
      );
      setPreview(null);
      await Promise.all([loadEstado(), loadPanel()]);
      api<CierreHistorial[]>(`/api/organizations/${orgId}/dgii/606/historial`)
        .then(setHistorial)
        .catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  const invLink = (params: Record<string, string>) =>
    `/orgs/${orgId}/invoices?${new URLSearchParams(params)}`;

  return (
    <>
      <h1>Reporte 606 (compras de gastos)</h1>
      <p className="muted">
        El 606 se presenta <strong>por cada cliente</strong> (contribuyente) con su propio RNC.
        Selecciona el mes y revisa el estado de cada uno.
      </p>
      {error && <div className="error">{error}</div>}

      {/* Selector de mes + descarga masiva. */}
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div>
            <label>Mes fiscal</label>
            <input
              type="month"
              value={aMonthInput(periodo)}
              onChange={(e) => setPeriodo(deMonthInput(e.target.value))}
            />
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <button className="secondary" onClick={doDownloadZip} disabled={!validPeriodo}>
              ⬇ Descargar todos (ZIP)
            </button>
          </div>
        </div>
        {clients.length === 0 && (
          <p className="muted" style={{ margin: '8px 0 0' }}>
            Aún no tienes clientes. Crea el contribuyente en la pestaña <strong>Clientes</strong>{' '}
            para poder generar su 606.
          </p>
        )}
      </div>

      {/* Panel del despacho: semáforo de todos los clientes del período. */}
      {panel && panel.clientes.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Estado del 606 por cliente</h2>
            <span
              style={{
                color: panel.vencido || panel.diasRestantes <= 3 ? 'var(--danger)' : 'var(--muted)',
              }}
            >
              Vence {panel.fechaLimite}
              {panel.vencido
                ? ` · venció hace ${Math.abs(panel.diasRestantes)} día(s)`
                : ` · faltan ${panel.diasRestantes} día(s)`}
            </span>
          </div>

          {panel.sinAsignar > 0 && (
            <div className="notice" style={{ marginTop: 10 }}>
              <Link href={invLink({ periodo, estado: '' })}>
                {panel.sinAsignar} factura(s) del período sin asignar a ningún cliente →
              </Link>{' '}
              — asígnalas para que entren a un 606.
            </div>
          )}

          <table style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th></th>
                <th>Cliente</th>
                <th style={{ textAlign: 'right' }}>Listas</th>
                <th style={{ textAlign: 'right' }}>En revisión</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {panel.clientes.map((c) => (
                <tr key={c.clienteId}>
                  <td>
                    <span
                      title={SEMAFORO[c.semaforo].label}
                      style={{
                        display: 'inline-block',
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: SEMAFORO[c.semaforo].color,
                      }}
                    />
                  </td>
                  <td>
                    {c.razonSocial}
                    <br />
                    <span className="muted" style={{ fontSize: 12 }}>
                      {c.rnc}
                      {!c.rncValido && (
                        <span style={{ color: 'var(--danger)' }}> · RNC inválido</span>
                      )}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{c.totales.reportables}</td>
                  <td style={{ textAlign: 'right' }}>
                    {c.totales.enRevision > 0 ? (
                      <Link
                        href={invLink({ clientId: c.clienteId, periodo, estado: 'en_revision' })}
                        style={{ color: 'var(--danger)' }}
                      >
                        {c.totales.enRevision}
                      </Link>
                    ) : (
                      0
                    )}
                  </td>
                  <td>
                    {c.listoParaCerrar ? (
                      <span style={{ color: 'var(--ok)' }}>Listo</span>
                    ) : c.bloqueos.length > 0 ? (
                      <span className="muted" title={c.bloqueos.join(' · ')}>
                        {c.bloqueos[0]}
                        {c.bloqueos.length > 1 ? ` (+${c.bloqueos.length - 1})` : ''}
                      </span>
                    ) : (
                      <span className="muted">Sin facturas</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => setClientId(c.clienteId)}
                      aria-label={`Abrir el 606 de ${c.razonSocial}`}
                    >
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detalle de un cliente seleccionado: generar/descargar/cerrar su 606. */}
      {cliente && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h2 style={{ margin: 0, flex: 1 }}>
              606 de {cliente.razonSocial} · {cliente.rncOCedula}
            </h2>
            <button
              type="button"
              className="secondary"
              onClick={() => setClientId('')}
              style={{ margin: 0, padding: '4px 12px' }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button onClick={doPreview} disabled={busy || !listo}>
              Vista previa
            </button>
            <button className="secondary" onClick={doDownload} disabled={!listo}>
              Descargar TXT
            </button>
            <button className="secondary" onClick={doDownloadExcel} disabled={!listo}>
              Descargar Excel
            </button>
          </div>

          {estado && estado.semaforo !== 'vacio' && (
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

          {estado && estado.bloqueos.length > 0 && (
            <div className="error">
              <strong>Falta para poder cerrar:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {estado.bloqueos.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
              {estado.totales.enRevision > 0 && (
                <Link href={invLink({ clientId, periodo, estado: 'en_revision' })}>
                  Ir a revisar sus facturas →
                </Link>
              )}
              {estado.totales.sinFormaPago > 0 && (
                <div
                  style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                >
                  <select
                    value={bulkFormaPago}
                    onChange={(e) => setBulkFormaPago(e.target.value)}
                    aria-label="Forma de pago para aplicar en lote"
                  >
                    <option value="">Forma de pago…</option>
                    <option value="1">1 · Efectivo</option>
                    <option value="2">2 · Cheque / transferencia</option>
                    <option value="3">3 · Tarjeta crédito/débito</option>
                    <option value="4">4 · Compra a crédito</option>
                    <option value="5">5 · Permuta</option>
                    <option value="6">6 · Nota de crédito</option>
                    <option value="7">7 · Mixto / otras</option>
                  </select>
                  <button
                    className="secondary"
                    disabled={!bulkFormaPago || busy}
                    onClick={aplicarFormaPagoLote}
                  >
                    Aplicar a las {estado.totales.sinFormaPago} sin forma de pago
                  </button>
                </div>
              )}
            </div>
          )}
          {estado && estado.avisos.length > 0 && (
            <div className="notice">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {estado.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {preview && (
            <div style={{ marginTop: 12 }}>
              <h3 style={{ marginBottom: 6 }}>Vista previa — {preview.nombreArchivo}</h3>
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
                  {preview.omitidas.length} factura(s) del período no se incluyen por datos
                  incompletos:
                  <ul style={{ margin: '6px 0 0' }}>
                    {preview.omitidas.map((o) => (
                      <li key={o.id}>
                        <Link href={invLink({ open: o.id, clientId, periodo, estado: '' })}>
                          {o.proveedor ?? 'Proveedor sin nombre'}
                          {o.monto != null ? ` · ${money(o.monto)}` : ''}
                        </Link>{' '}
                        — {o.razon}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="muted">Todas las facturas del período tienen datos completos.</p>
              )}
              <button onClick={doCerrar} disabled={busy}>
                Cerrar período e incluir en 606
              </button>
            </div>
          )}

          {cierre && (
            // Momento de victoria (regla pico-final): cerrar el 606 es el logro
            // del mes; que se sienta como tal, con el recuento de valor.
            <div className="cierre-victoria" style={{ marginTop: 12 }}>
              <div className="cierre-victoria-head">
                <span className="cierre-check" aria-hidden>✓</span>
                <div>
                  <strong>606 de {cierre.cliente.razonSocial} listo</strong>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
                    Período {cierre.periodo}
                    {estado && !estado.vencido && estado.diasRestantes >= 0
                      ? ` · cerrado ${estado.diasRestantes} día(s) antes de la fecha límite`
                      : ''}
                  </p>
                </div>
              </div>
              <div className="cierre-victoria-cifras">
                <div>
                  <strong>{cierre.incluidas}</strong>
                  <span>factura{cierre.incluidas === 1 ? '' : 's'} en el 606</span>
                </div>
                <div>
                  <strong>{money(cierre.montoReportado)}</strong>
                  <span>reportado a la DGII</span>
                </div>
                {cierre.omitidas.length > 0 && (
                  <div>
                    <strong>{cierre.omitidas.length}</strong>
                    <span>quedaron fuera</span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                <button onClick={doDownload}>⬇ Descargar TXT</button>
                <button className="secondary" onClick={doDownloadExcel}>
                  ⬇ Descargar Excel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Historial de cierres: qué 606 ya se cerró, cuándo y quién. */}
      {historial.length > 0 && (
        <div className="card">
          <h2>Historial de cierres</h2>
          <table>
            <thead>
              <tr>
                <th>Período</th>
                <th>Cliente</th>
                <th style={{ textAlign: 'right' }}>Incluidas</th>
                <th>Cerrado</th>
                <th>Por</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((h, i) => (
                <tr key={i}>
                  <td>{h.periodo}</td>
                  <td>
                    {h.cliente ?? '—'}
                    {h.rnc && (
                      <>
                        <br />
                        <span className="muted" style={{ fontSize: 12 }}>
                          {h.rnc}
                        </span>
                      </>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>{h.incluidas ?? '—'}</td>
                  <td>{fechaCorta(h.fecha)}</td>
                  <td>{h.usuario ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
