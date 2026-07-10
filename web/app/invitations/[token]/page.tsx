'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, clearTokens, getTokens, PENDING_INVITE_KEY } from '../../../lib/api';

interface InviteInfo {
  organization: string;
  email: string;
  rol: string;
  /** Negocio vinculado (solo invitaciones de cliente). */
  negocio: string | null;
  estado: 'pendiente' | 'aceptada' | 'expirada';
}

const ROL_LABEL: Record<string, string> = { contador: 'contador', cliente: 'cliente' };

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
      const membership = await api<{ organizationId: string; rol: string }>(
        `/api/invitations/${token}/accept`,
        { method: 'POST' },
      );
      localStorage.removeItem(PENDING_INVITE_KEY);
      // Cada rol aterriza en SU lugar: el dashboard es del contador/admin y a
      // un cliente le respondía "no tienes permiso" (hallazgo F-04).
      router.push(
        membership.rol === 'cliente'
          ? `/orgs/${membership.organizationId}/mi-negocio`
          : `/orgs/${membership.organizationId}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  function goAuth(path: '/login' | '/register') {
    localStorage.setItem(PENDING_INVITE_KEY, token);
    router.push(path);
  }

  // La sesión activa es de otra persona: ofrecer la salida en un clic en vez
  // de dejar al usuario atascado frente al error.
  function cambiarDeCuenta() {
    clearTokens();
    localStorage.setItem(PENDING_INVITE_KEY, token);
    window.location.reload();
  }

  const mismatch = error.includes('otro correo');

  return (
    <main className="auth-box">
      <div className="card">
        <h1>Invitación</h1>
        {error && (
          <div className="error">
            {error}
            {mismatch && info && (
              <p style={{ margin: '8px 0 0' }}>
                <button type="button" className="secondary" onClick={cambiarDeCuenta}>
                  Cerrar esta sesión y continuar como {info.email}
                </button>
              </p>
            )}
          </div>
        )}
        {info && (
          <>
            <p>
              <strong>{info.organization}</strong> te invita como{' '}
              <strong>{ROL_LABEL[info.rol] ?? info.rol}</strong> ({info.email})
              {info.negocio && (
                <>
                  {' '}
                  para enviar los gastos de <strong>{info.negocio}</strong>
                </>
              )}
              .
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
