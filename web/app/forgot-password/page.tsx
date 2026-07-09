'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import ThemeToggle from '../../components/ThemeToggle';
import Logo from '../../components/Logo';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Solo en desarrollo (sin proveedor de correo): el API devuelve el enlace.
  const [devUrl, setDevUrl] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ devResetUrl?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: { email },
      });
      setDevUrl(r.devResetUrl ?? null);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
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
          <Link href="/" aria-label="Volver al inicio">
            <Logo size={44} />
          </Link>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Restablecer contraseña</h2>
          {sent ? (
            <>
              <p>
                Si <strong>{email}</strong> tiene una cuenta, te enviamos un enlace para restablecer
                tu contraseña. Revisa tu correo (y la carpeta de spam).
              </p>
              {devUrl && (
                <div className="notice">
                  <strong>Modo desarrollo</strong> (sin correo configurado): usa este enlace directo:
                  <br />
                  <Link href={devUrl.replace(/^https?:\/\/[^/]+/, '')}>Restablecer ahora →</Link>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="muted">
                Escribe tu correo y te enviaremos un enlace para crear una nueva contraseña.
              </p>
              {error && <div className="error">{error}</div>}
              <form onSubmit={submit}>
                <label>Correo electrónico</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <button disabled={busy}>{busy ? 'Enviando…' : 'Enviar enlace'}</button>
              </form>
            </>
          )}
          <p className="muted" style={{ marginTop: 16 }}>
            <Link href="/login">← Volver a iniciar sesión</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
