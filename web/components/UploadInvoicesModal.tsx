'use client';

// Subida de facturas desde el navegador (T5 del plan post-pruebas): el contador
// recibe facturas por correo/papel y no debe depender del teléfono. Cada
// archivo = una factura (para recibos largos multi-página está la app móvil).
// Reutilizable: la vista del cliente (mi-negocio) usa el mismo componente.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiUpload } from '../lib/api';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // el API rechaza más de 10 MB

type FileState = 'pendiente' | 'subiendo' | 'ok' | 'error';

interface UploadItem {
  file: File;
  estado: FileState;
  mensaje?: string;
}

export default function UploadInvoicesModal({
  orgId,
  clientes,
  clienteFijo,
  onClose,
  onUploaded,
}: {
  orgId: string;
  /** Clientes para asignar al subir (vacío u omitido = solo "sin asignar"). */
  clientes?: { id: string; razonSocial: string }[];
  /** Fija el cliente (vista del dueño de negocio): oculta el selector. */
  clienteFijo?: string;
  onClose: () => void;
  /** Cuántas facturas subieron bien (para refrescar la lista). */
  onUploaded: (subidas: number) => void;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [clientProfileId, setClientProfileId] = useState(clienteFijo ?? '');
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const subidasRef = useRef(0);

  const addFiles = useCallback((files: FileList | File[]) => {
    const nuevos: UploadItem[] = [];
    for (const file of Array.from(files)) {
      if (!ACCEPTED.includes(file.type)) {
        nuevos.push({ file, estado: 'error', mensaje: 'Solo imágenes JPG, PNG o WebP' });
      } else if (file.size > MAX_SIZE) {
        nuevos.push({ file, estado: 'error', mensaje: 'Más de 10 MB — comprime la foto' });
      } else {
        nuevos.push({ file, estado: 'pendiente' });
      }
    }
    setItems((prev) => [...prev, ...nuevos]);
  }, []);

  const pendientes = items.filter((i) => i.estado === 'pendiente').length;

  async function subir() {
    setBusy(true);
    // Secuencial: mantiene el orden de carga y no satura el API.
    for (let idx = 0; idx < items.length; idx++) {
      if (items[idx]?.estado !== 'pendiente') continue;
      setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, estado: 'subiendo' } : it)));
      try {
        const fd = new FormData();
        fd.append('file', items[idx]!.file);
        if (clientProfileId) fd.append('clientProfileId', clientProfileId);
        await apiUpload(`/api/organizations/${orgId}/invoices`, fd);
        subidasRef.current += 1;
        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, estado: 'ok' } : it)));
      } catch (e) {
        setItems((prev) =>
          prev.map((it, i) =>
            i === idx
              ? { ...it, estado: 'error', mensaje: e instanceof Error ? e.message : 'Error al subir' }
              : it,
          ),
        );
      }
    }
    setBusy(false);
  }

  const cerrar = useCallback(() => {
    onUploaded(subidasRef.current);
    onClose();
  }, [onClose, onUploaded]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) cerrar();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, cerrar]);

  const ICONO: Record<FileState, string> = {
    pendiente: '·',
    subiendo: '⏳',
    ok: '✓',
    error: '✕',
  };
  const COLOR: Record<FileState, string> = {
    pendiente: 'var(--muted)',
    subiendo: 'var(--muted)',
    ok: 'var(--ok)',
    error: 'var(--danger)',
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10, 12, 24, 0.55)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '48px 16px',
        overflowY: 'auto',
        zIndex: 50,
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Subir facturas</h2>
          <button
            type="button"
            className="secondary"
            onClick={cerrar}
            disabled={busy}
            aria-label="Cerrar"
            style={{ marginLeft: 'auto' }}
          >
            ✕
          </button>
        </div>

        <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
          Fotos nítidas, con los 4 bordes del comprobante visibles. Cada imagen se
          procesa como una factura; para recibos largos por secciones usa la app móvil.
        </p>

        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
          }}
          style={{
            border: `2px dashed ${dragOver ? 'var(--brand)' : 'var(--border)'}`,
            borderRadius: 12,
            padding: '32px 16px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? 'var(--bg-soft)' : 'transparent',
            marginBottom: 14,
          }}
        >
          <strong>Arrastra las fotos aquí</strong>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            o haz clic para elegirlas (JPG, PNG o WebP · máx. 10 MB c/u)
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(',')}
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {!clienteFijo && (clientes?.length ?? 0) > 0 && (
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="upload-cliente">Empresa (cliente) — opcional</label>
            <select
              id="upload-cliente"
              value={clientProfileId}
              onChange={(e) => setClientProfileId(e.target.value)}
              disabled={busy}
              style={{ width: '100%' }}
            >
              <option value="">— Sin asignar (la IA intenta por el RNC del comprador) —</option>
              {clientes!.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razonSocial}
                </option>
              ))}
            </select>
          </div>
        )}

        {items.length > 0 && (
          <ul style={{ listStyle: 'none', margin: '0 0 14px', padding: 0, display: 'grid', gap: 6 }}>
            {items.map((it, i) => (
              <li
                key={`${it.file.name}-${i}`}
                style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 14 }}
              >
                <span style={{ color: COLOR[it.estado], fontWeight: 700, width: 18 }}>
                  {ICONO[it.estado]}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.file.name}
                </span>
                <span className="muted" style={{ marginLeft: 'auto', fontSize: 12.5, flexShrink: 0 }}>
                  {it.estado === 'error' ? it.mensaje : it.estado === 'ok' ? 'recibida' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="secondary" onClick={cerrar} disabled={busy}>
            {items.some((i) => i.estado === 'ok') ? 'Listo' : 'Cancelar'}
          </button>
          <button type="button" onClick={subir} disabled={busy || pendientes === 0}>
            {busy
              ? 'Subiendo…'
              : pendientes > 0
                ? `Subir ${pendientes} factura${pendientes === 1 ? '' : 's'}`
                : 'Subir'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
