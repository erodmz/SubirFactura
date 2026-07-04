'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, saveTokens, PENDING_INVITE_KEY, type Tokens } from '../../lib/api';
import ThemeToggle from '../../components/ThemeToggle';
import Logo from '../../components/Logo';

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

  // TODO(dev): quitar antes de producción — ingreso rápido con la cuenta de prueba.
  function quickLogin() {
    setEmail('elmer.test@facturard.do');
    setPassword('clave-segura-123');
    doLogin('elmer.test@facturard.do', 'clave-segura-123');
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
                padding: '4px 8px',
                background: 'transparent',
                border: 'none',
                color: 'var(--muted)',
                fontSize: 18,
                cursor: 'pointer',
              }}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
          <button disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        </form>
        <button
          type="button"
          className="secondary"
          onClick={quickLogin}
          disabled={busy}
          style={{ width: '100%' }}
        >
          ⚡ Ingreso rápido (dev)
        </button>
        <p className="muted" style={{ marginTop: 16 }}>
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
