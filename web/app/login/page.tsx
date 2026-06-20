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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { tokens } = await api<{ tokens: Tokens }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      saveTokens(tokens);
      const pendingInvite = localStorage.getItem(PENDING_INVITE_KEY);
      router.push(pendingInvite ? `/invitations/${pendingInvite}` : '/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-top">
        <ThemeToggle />
      </div>
      <div className="auth-box">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <Logo size={44} />
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
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        </form>
        <p className="muted" style={{ marginTop: 16 }}>
          ¿No tienes cuenta? <Link href="/register">Regístrate</Link>
        </p>
        </div>
      </div>
    </div>
  );
}
