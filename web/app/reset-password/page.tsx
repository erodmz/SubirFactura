'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../lib/api';
import ThemeToggle from '../../components/ThemeToggle';
import Logo from '../../components/Logo';
import { EyeIcon, EyeOffIcon } from '../../components/icons';

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: { token, newPassword: password },
      });
      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="card">
        <div className="error">Enlace inválido: falta el token. Solicita uno nuevo.</div>
        <p className="muted" style={{ marginTop: 16 }}>
          <Link href="/forgot-password">Solicitar enlace de restablecimiento</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Nueva contraseña</h2>
      {done ? (
        <p style={{ color: 'var(--ok)' }}>
          ✓ Contraseña actualizada. Te llevamos a iniciar sesión…
        </p>
      ) : (
        <>
          <p className="muted">Escribe tu nueva contraseña (mínimo 8 caracteres).</p>
          {error && <div className="error">{error}</div>}
          <form onSubmit={submit}>
            <label>Nueva contraseña</label>
            <div style={{ position: 'relative' }}>
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                style={{
                  position: 'absolute',
                  right: 6,
                  top: 6,
                  margin: 0,
                  padding: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {show ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
              </button>
            </div>
            <label>Confirmar contraseña</label>
            <input
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            <button disabled={busy}>{busy ? 'Guardando…' : 'Cambiar contraseña'}</button>
          </form>
        </>
      )}
      <p className="muted" style={{ marginTop: 16 }}>
        <Link href="/login">← Volver a iniciar sesión</Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
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
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
