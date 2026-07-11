'use client';

import { useState } from 'react';
import { api } from '../lib/api';

/**
 * Aviso blando: aparece mientras la cuenta no ha confirmado su correo. No
 * bloquea el uso (hoy no hay proveedor de correo conectado); solo recuerda y
 * permite reenviar el enlace. Cuando se exija la verificación, este mismo aviso
 * pasa a ser la puerta.
 */
export default function VerifyEmailBanner({ email }: { email: string }) {
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'enviado' | 'error'>('idle');

  async function reenviar() {
    setEstado('enviando');
    try {
      await api('/api/auth/resend-verification', { method: 'POST', body: { email } });
      setEstado('enviado');
    } catch {
      setEstado('error');
    }
  }

  return (
    <div className="verify-banner" role="status">
      <span className="verify-banner-icon" aria-hidden>
        ✉️
      </span>
      <div className="verify-banner-text">
        <strong>Confirma tu correo.</strong> Te enviamos un enlace a{' '}
        <span className="verify-banner-email">{email}</span>. Ábrelo para asegurar tu cuenta.
      </div>
      {estado === 'enviado' ? (
        <span className="verify-banner-ok">✓ Enlace reenviado</span>
      ) : (
        <button
          type="button"
          className="verify-banner-btn"
          onClick={reenviar}
          disabled={estado === 'enviando'}
        >
          {estado === 'enviando' ? 'Enviando…' : estado === 'error' ? 'Reintentar' : 'Reenviar enlace'}
        </button>
      )}
    </div>
  );
}
