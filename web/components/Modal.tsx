'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Modal reutilizable: portal a document.body (evita el transform de .app-content),
 * cierra con Esc y con clic en el fondo, atrapa el foco inicial y bloquea el
 * scroll del cuerpo mientras está abierto. El pie (footer) es opcional.
 */
export default function Modal({
  title,
  onClose,
  children,
  footer,
  width = 560,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Bloquea el scroll de fondo mientras el modal está abierto.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Foco al primer control del panel (accesibilidad de teclado).
    panelRef.current
      ?.querySelector<HTMLElement>('input, select, textarea, button')
      ?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="modal-panel"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title">{title}</h2>
          <button
            type="button"
            className="modal-x"
            onClick={onClose}
            aria-label="Cerrar (Esc)"
            title="Cerrar (Esc)"
          >
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
