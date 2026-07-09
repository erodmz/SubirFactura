'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, saveTokens, PENDING_INVITE_KEY, type Tokens } from '../../lib/api';
import ThemeToggle from '../../components/ThemeToggle';
import Logo from '../../components/Logo';
import { EyeIcon, EyeOffIcon } from '../../components/icons';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function doLogin(em: string, pw: string) {
    setBusy(true);
    setError('');
    try {
      const { tokens } = await api<{ tokens: Tokens }>('/api/auth/login', {
        method: 'POST',
        body: { email: em, password: pw },
      });
      saveTokens(tokens);
      const pendingInvite = localStorage.getItem(PENDING_INVITE_KEY);
      router.push(pendingInvite ? `/invitations/${pendingInvite}` : '/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    doLogin(email, password);
  }

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
        <p className="muted" style={{ textAlign: 'center', marginBottom: 24 }}>
          Digitaliza y reporta los gastos de tus clientes ante la DGII.
        </p>
        <div className="card">
        {error && <div className="error">{error}</div>}
        <form onSubmit={submit}>
          <label>Correo electrónico</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label>Contraseña</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              title={showPassword ? 'Ocultar' : 'Mostrar'}
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
              {showPassword ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
            </button>
          </div>
          <button disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        </form>
        <p className="muted" style={{ marginTop: 16, textAlign: 'center' }}>
          <Link href="/forgot-password">¿Olvidaste tu contraseña?</Link>
        </p>
        <p className="muted" style={{ marginTop: 8 }}>
          ¿No tienes cuenta? <Link href="/register">Regístrate</Link>
        </p>
        </div>
        <p className="muted" style={{ textAlign: 'center', marginTop: 18 }}>
          <Link href="/">← Volver al inicio</Link>
        </p>
      </div>
    </div>
  );
}
