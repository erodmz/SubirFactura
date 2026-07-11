'use client';

// Botón flotante "Subir facturas" — siempre a la vista, abajo a la derecha,
// como el FAB de la app móvil. Va por portal a <body> porque el layout
// (.app-content) tiene transform y eso rompe position:fixed de los hijos
// (el mismo motivo por el que el modal de revisión usa createPortal).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function FabSubir({ onClick }: { onClick: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <button className="fab-subir" onClick={onClick} aria-label="Subir facturas">
      <span aria-hidden style={{ fontSize: 18 }}>⬆</span>
      <span>Subir facturas</span>
    </button>,
    document.body,
  );
}
