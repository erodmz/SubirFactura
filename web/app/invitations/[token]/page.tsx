'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, getTokens, PENDING_INVITE_KEY } from '../../../lib/api';

interface InviteInfo {
  organization: string;
  email: string;
  rol: string;
  estado: 'pendiente' | 'aceptada' | 'expirada';
}

export default function InvitationPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<InviteInfo>(`/api/invitations/${token}`)
      .then(setInfo)
      .catch((err) => setError(err instanceof Error ? err.message : 'Invitación no encontrada'));
  }, [token]);

  async function accept() {
    setError('');
    try {
      const membership = await api<{ organizationId: string }>(
        `/api/invitations/${token}/accept`,
        { method: 'POST' },
      );
      localStorage.removeItem(PENDING_INVITE_KEY);
      router.push(`/orgs/${membership.organizationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  function goAuth(path: '/login' | '/register') {
    localStorage.setItem(PENDING_INVITE_KEY, token);
    router.push(path);
  }

  return (
    <main className="auth-box">
      <div className="card">
        <h1>Invitación</h1>
        {error && <div className="error">{error}</div>}
        {info && (
          <>
            <p>
              <strong>{info.organization}</strong> te invita como <strong>{info.rol}</strong> (
              {info.email}).
            </p>
            {info.estado !== 'pendiente' && (
              <div className="notice">Esta invitación está {info.estado}.</div>
            )}
            {info.estado === 'pendiente' &&
              (getTokens() ? (
                <button onClick={accept}>Aceptar invitación</button>
              ) : (
                <>
                  <p className="muted">Inicia sesión o crea una cuenta con {info.email}:</p>
                  <div className="row">
                    <button onClick={() => goAuth('/login')}>Iniciar sesión</button>
                    <button className="secondary" onClick={() => goAuth('/register')}>
                      Crear cuenta
                    </button>
                  </div>
                </>
              ))}
          </>
        )}
      </div>
    </main>
  );
}
