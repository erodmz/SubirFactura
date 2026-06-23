'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, saveTokens, PENDING_INVITE_KEY, type Tokens } from '../../lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ nombre: '', email: '', password: '', telefono: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { tokens } = await api<{ tokens: Tokens }>('/api/auth/register', {
        method: 'POST',
        body: { ...form, telefono: form.telefono || undefined },
      });
      saveTokens(tokens);
      const pendingInvite = localStorage.getItem(PENDING_INVITE_KEY);
      router.push(pendingInvite ? `/invitations/${pendingInvite}` : '/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
      setBusy(false);
    }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <main className="auth-box">
      <div className="card">
        <h1>Crear cuenta</h1>
        {error && <div className="error">{error}</div>}
        <form onSubmit={submit}>
          <label>Nombre completo</label>
          <input value={form.nombre} onChange={set('nombre')} required />
          <label>Correo electrónico</label>
          <input type="email" value={form.email} onChange={set('email')} required />
          <label>Contraseña (mínimo 8 caracteres)</label>
          <input type="password" value={form.password} onChange={set('password')} required />
          <label>Teléfono (opcional)</label>
          <input value={form.telefono} onChange={set('telefono')} />
          <button disabled={busy}>{busy ? 'Creando…' : 'Crear cuenta'}</button>
        </form>
        <p className="muted" style={{ marginTop: 16 }}>
          ¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link>
        </p>
      </div>
      <p className="muted" style={{ textAlign: 'center', marginTop: 18 }}>
        <Link href="/">← Volver al inicio</Link>
      </p>
    </main>
  );
}
