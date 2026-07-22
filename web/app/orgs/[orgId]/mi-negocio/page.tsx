'use client';

// Espacio del CLIENTE (dueño de negocio) en la web — D1 del plan post-pruebas.
// Antes, al aceptar la invitación caía en el dashboard del contador y recibía
// "no tienes permiso" (F-04). Aquí solo lo suyo: subir gastos y ver su estado.

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../../lib/api';
import { useAutoRefresh } from '../../../../lib/useAutoRefresh';
import UploadInvoicesModal from '../../../../components/UploadInvoicesModal';
import ManualInvoiceModal from '../../../../components/ManualInvoiceModal';
import FabSubir from '../../../../components/FabSubir';
import type { Invoice, Me } from '../../../../lib/types';

const ESTADO_LABEL: Record<string, string> = {
  subida: 'Recibida',
  procesando: 'Leyendo…',
  extraida: 'Leída',
  en_revision: 'Con tu contador',
  validada: 'Validada',
  incluida_en_606: 'Reportada a la DGII',
  reportada: 'Reportada a la DGII',
  rechazada: 'Rechazada',
  duplicada: 'Duplicada',
};

export default function MiNegocioPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [me, setMe] = useState<Me | null>(null);
  const [negocios, setNegocios] = useState<{ id: string; razonSocial: string }[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<Invoice[]>(`/api/organizations/${orgId}/invoices`)
      .then(setInvoices)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudieron cargar tus facturas'));
    api<{ id: string; razonSocial: string }[]>(`/api/organizations/${orgId}/clients`)
      .then(setNegocios)
      .catch(() => {});
  }, [orgId]);

  useEffect(() => {
    api<Me>('/api/me').then(setMe).catch(() => {});
    load();
  }, [load]);

  // Las facturas cambian solas (OCR): polling suave + refresh al volver el foco.
  useAutoRefresh(load);

  const nombre = me?.nombre?.split(/\s+/)[0];

  return (
    <>
      <h1>{nombre ? `Hola, ${nombre} 👋` : 'Mis facturas'}</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        {negocios.length === 1
          ? `Gastos de ${negocios[0]!.razonSocial}. Sube la foto y tu contador se encarga del resto.`
          : 'Sube la foto de tus facturas de gastos y tu contador se encarga del resto.'}
      </p>

      {error && <div className="error">{error}</div>}

      <p style={{ marginTop: 8 }}>
        <button type="button" className="link-btn" onClick={() => setShowManual(true)}>
          ✍️ ¿Sin comprobante que fotografiar? Regístralo a mano
        </button>
      </p>

      <div className="card" style={{ marginTop: 8 }}>
        {invoices.length === 0 ? (
          <p className="muted">
            Aún no hay facturas. Sube la primera con el botón de abajo — solo necesitas una
            foto nítida del comprobante.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>NCF</th>
                <th>Fecha</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.razonSocialProveedor ?? '—'}</td>
                  <td>{inv.ncf ?? '—'}</td>
                  <td>{inv.fecha?.slice(0, 10) ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {inv.montoFacturado != null
                      ? Number(inv.montoFacturado).toLocaleString('es-DO', {
                          minimumFractionDigits: 2,
                        })
                      : '—'}
                  </td>
                  <td>{ESTADO_LABEL[inv.estado] ?? inv.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <FabSubir onClick={() => setShowUpload(true)} />

      {showManual && (
        <ManualInvoiceModal
          orgId={orgId}
          clientes={negocios}
          clienteFijo={negocios.length === 1 ? negocios[0]!.id : undefined}
          puedeValidar={false}
          onClose={() => setShowManual(false)}
          onCreated={load}
        />
      )}

      {showUpload && (
        <UploadInvoicesModal
          orgId={orgId}
          // Sus facturas son SIEMPRE de su negocio: se adjunta en silencio, sin
          // selector. Si tuviera más de uno, sube sin asignar y el worker
          // clasifica por el RNC del comprador.
          clienteFijo={negocios.length === 1 ? negocios[0]!.id : undefined}
          onClose={() => setShowUpload(false)}
          onUploaded={(subidas) => {
            if (subidas > 0) load();
          }}
        />
      )}
    </>
  );
}
