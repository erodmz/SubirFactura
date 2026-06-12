'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, saveTokens, PENDING_INVITE_KEY, type Tokens } from '../../lib/api';

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
      router.push(pendingInvite ? `/invitations/${pendingInvite}` : '/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
      setBusy(false);
    }
  }

  return (
    <main className="auth-box">
      <div className="card">
        <h1>FacturaRD</h1>
        <p className="muted">Inicia sesión para administrar las facturas de tus clientes.</p>
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
    </main>
  );
}
