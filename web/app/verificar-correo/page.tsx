'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../lib/api';
import ThemeToggle from '../../components/ThemeToggle';
import Logo from '../../components/Logo';

function VerifyView() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>(token ? 'cargando' : 'error');
  const [error, setError] = useState(token ? '' : 'Enlace inválido: falta el token.');
  const yaCorrio = useRef(false);

  useEffect(() => {
    if (!token || yaCorrio.current) return;
    yaCorrio.current = true; // el enlace es de un solo uso: no reintentar en re-render
    (async () => {
      try {
        await api('/api/auth/verify-email', { method: 'POST', body: { token } });
        setEstado('ok');
        setTimeout(() => router.push('/app'), 2500);
      } catch (err) {
        setEstado('error');
        setError(err instanceof Error ? err.message : 'El enlace no es válido o ya venció.');
      }
    })();
  }, [token, router]);

  return (
    <div className="card">
      {estado === 'cargando' && (
        <>
          <h2 style={{ marginTop: 0 }}>Confirmando tu correo…</h2>
          <p className="muted">Un momento, estamos verificando el enlace.</p>
        </>
      )}
      {estado === 'ok' && (
        <>
          <h2 style={{ marginTop: 0, color: 'var(--ok)' }}>✓ Correo confirmado</h2>
          <p className="muted">Gracias. Te llevamos a tu panel…</p>
        </>
      )}
      {estado === 'error' && (
        <>
          <h2 style={{ marginTop: 0 }}>No pudimos confirmar el correo</h2>
          <div className="error">{error}</div>
          <p className="muted" style={{ marginTop: 16 }}>
            Inicia sesión y pídenos un enlace nuevo desde el aviso de tu panel.
          </p>
          <p className="muted" style={{ marginTop: 8 }}>
            <Link href="/login">← Ir a iniciar sesión</Link>
          </p>
        </>
      )}
    </div>
  );
}

export default function VerificarCorreoPage() {
  return (
    <div className="auth-shell">
      <div className="auth-top">
        <ThemeToggle />
      </div>
      <div className="auth-box">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <Link href="/" aria-label="Volver al inicio">
            <Logo size={44} />
          </Link>
        </div>
        <Suspense fallback={<div className="card">Cargando…</div>}>
          <VerifyView />
        </Suspense>
      </div>
    </div>
  );
}
