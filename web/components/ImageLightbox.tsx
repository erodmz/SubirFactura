'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Visor de imagen a pantalla (popup) con zoom in/out, arrastrar para desplazar
 * y navegación entre páginas. Se abre sobre el modal, sin salir de la app.
 */
export default function ImageLightbox({
  urls,
  startIndex = 0,
  onClose,
}: {
  urls: string[];
  startIndex?: number;
  onClose: () => void;
}) {
  const [i, setI] = useState(startIndex);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const zoomIn = () => setScale((s) => Math.min(5, +(s + 0.5).toFixed(2)));
  const zoomOut = () =>
    setScale((s) => {
      const n = Math.max(1, +(s - 0.5).toFixed(2));
      if (n === 1) setPos({ x: 0, y: 0 });
      return n;
    });
  const reset = () => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  };
  const prev = () => setI((v) => (v > 0 ? v - 1 : v));
  const next = () => setI((v) => (v < urls.length - 1 ? v + 1 : v));

  // Al cambiar de página, reinicia zoom/posición.
  useEffect(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, [i]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-') zoomOut();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls.length]);

  if (!mounted) return null;

  const btn: React.CSSProperties = {
    margin: 0,
    width: 42,
    height: 42,
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(0,0,0,0.5)',
    color: '#fff',
    fontSize: 20,
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
      }}
      onClick={onClose}
    >
      {/* Barra de controles */}
      <div
        style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', padding: 14 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button style={btn} onClick={zoomOut} title="Alejar (−)" aria-label="Alejar">
          −
        </button>
        <button style={{ ...btn, width: 'auto', padding: '0 14px', fontSize: 14 }} onClick={reset}>
          {Math.round(scale * 100)}%
        </button>
        <button style={btn} onClick={zoomIn} title="Acercar (+)" aria-label="Acercar">
          +
        </button>
        {urls.length > 1 && (
          <>
            <button style={btn} onClick={prev} disabled={i === 0} title="Anterior (←)">
              ‹
            </button>
            <span style={{ color: '#fff', fontSize: 14, minWidth: 54, textAlign: 'center' }}>
              {i + 1} / {urls.length}
            </span>
            <button style={btn} onClick={next} disabled={i === urls.length - 1} title="Siguiente (→)">
              ›
            </button>
          </>
        )}
        <button style={{ ...btn, marginLeft: 8 }} onClick={onClose} title="Cerrar (Esc)" aria-label="Cerrar">
          ✕
        </button>
      </div>

      {/* Imagen */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'grid',
          placeItems: 'center',
          cursor: scale > 1 ? 'grab' : 'default',
        }}
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => (e.deltaY < 0 ? zoomIn() : zoomOut())}
        onMouseDown={(e) => {
          if (scale <= 1) return;
          drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
        }}
        onMouseMove={(e) => {
          if (!drag.current) return;
          setPos({
            x: drag.current.ox + (e.clientX - drag.current.x),
            y: drag.current.oy + (e.clientY - drag.current.y),
          });
        }}
        onMouseUp={() => (drag.current = null)}
        onMouseLeave={() => (drag.current = null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urls[i]}
          alt={`Página ${i + 1}`}
          draggable={false}
          style={{
            maxWidth: '92vw',
            maxHeight: 'calc(100vh - 90px)',
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transition: drag.current ? 'none' : 'transform 0.12s ease',
            userSelect: 'none',
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
