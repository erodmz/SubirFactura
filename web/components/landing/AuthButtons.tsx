'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getTokens } from '../../lib/api';

/**
 * Botones de acción sensibles a la sesión. Si ya hay sesión → "Ir al panel";
 * si no → iniciar sesión / comenzar gratis. `variant` ajusta el juego de botones
 * para la barra de navegación vs. el hero.
 */
export default function AuthButtons({ variant = 'nav' }: { variant?: 'nav' | 'hero' }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => setAuthed(!!getTokens()), []);

  // Evita parpadeo antes de saber si hay sesión: reserva el espacio.
  if (authed === null) return <span style={{ minWidth: 1 }} aria-hidden />;

  if (authed) {
    return (
      <Link className={`btn btn-primary${variant === 'hero' ? ' btn-lg' : ''}`} href="/app">
        Ir a mi panel →
      </Link>
    );
  }

  if (variant === 'hero') {
    return (
      <>
        <Link className="btn btn-primary btn-lg" href="/register">
          Comenzar gratis
        </Link>
        <a className="btn btn-ghost btn-lg" href="#como-funciona">
          Ver cómo funciona
        </a>
      </>
    );
  }

  return (
    <>
      <Link className="btn btn-ghost" href="/login">
        Iniciar sesión
      </Link>
      <Link className="btn btn-primary" href="/register">
        Comenzar gratis
      </Link>
    </>
  );
}
