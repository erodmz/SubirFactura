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
    setError('');
    // Validación propia en español (el mensaje nativo del navegador sale en
    // el idioma del sistema, en inglés en las pruebas).
    if (!form.nombre.trim()) return setError('Ingresa tu nombre completo');
    if (!/.+@.+\..+/.test(form.email)) return setError('El correo electrónico no es válido');
    if (form.password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres');
    setBusy(true);
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
        <form onSubmit={submit} noValidate>
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
