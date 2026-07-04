'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../../lib/api';
import type { Member } from '../../../../lib/types';

interface InviteResult {
  inviteUrl: string;
  limitWarning?: string;
}

export default function MembersPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [members, setMembers] = useState<Member[]>([]);
  const [invite, setInvite] = useState({ email: '', rol: 'contador' });
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<Member[]>(`/api/organizations/${orgId}/members`).then(setMembers).catch(() => {});
  }, [orgId]);

  useEffect(load, [load]);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInviteResult(null);
    try {
      const result = await api<InviteResult>(`/api/organizations/${orgId}/invitations`, {
        method: 'POST',
        body: invite,
      });
      setInviteResult(result);
      setInvite({ email: '', rol: 'contador' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  async function changeRole(membershipId: string, rol: string) {
    setError('');
    try {
      await api(`/api/organizations/${orgId}/members/${membershipId}`, {
        method: 'PATCH',
        body: { rol },
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
      load();
    }
  }

  async function setPuedeValidar(membershipId: string, puedeValidar: boolean) {
    setMembers((ms) => ms.map((m) => (m.id === membershipId ? { ...m, puedeValidar } : m)));
    try {
      await api(`/api/organizations/${orgId}/members/${membershipId}/validate-permission`, {
        method: 'PATCH',
        body: { puedeValidar },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
      load(); // revertir al estado real
    }
  }

  async function remove(membershipId: string) {
    if (!confirm('¿Quitar a este miembro de la organización?')) return;
    setError('');
    try {
      await api(`/api/organizations/${orgId}/members/${membershipId}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  return (
    <>
      <h1>Equipo</h1>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <h2>Invitar</h2>
        <form onSubmit={sendInvite}>
          <div className="row">
            <div>
              <label>Correo electrónico</label>
              <input
                type="email"
                value={invite.email}
                onChange={(e) => setInvite((i) => ({ ...i, email: e.target.value }))}
                required
              />
            </div>
            <div>
              <label>Rol</label>
              <select
                value={invite.rol}
                onChange={(e) => setInvite((i) => ({ ...i, rol: e.target.value }))}
              >
                <option value="contador">Contador</option>
                <option value="cliente">Cliente</option>
              </select>
            </div>
            <div style={{ flex: '0 0 auto' }}>
              <button>Generar invitación</button>
            </div>
          </div>
        </form>
        {inviteResult && (
          <div className="notice">
            Comparte este enlace (válido 7 días): <strong>{inviteResult.inviteUrl}</strong>
            {inviteResult.limitWarning && <p>{inviteResult.limitWarning}</p>}
          </div>
        )}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Puede validar</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.user.nombre}</td>
                <td className="muted">{m.user.email}</td>
                <td>
                  <select value={m.rol} onChange={(e) => changeRole(m.id, e.target.value)}>
                    <option value="org_admin">Administrador</option>
                    <option value="contador">Contador</option>
                    <option value="cliente">Cliente</option>
                  </select>
                </td>
                <td>
                  {m.rol === 'cliente' ? (
                    <label
                      style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, cursor: 'pointer' }}
                      title="Permite a este cliente validar facturas (no solo guardarlas)"
                    >
                      <input
                        type="checkbox"
                        checked={m.puedeValidar ?? false}
                        onChange={(e) => setPuedeValidar(m.id, e.target.checked)}
                        style={{ width: 'auto' }}
                      />
                      {m.puedeValidar ? 'Sí' : 'No'}
                    </label>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="danger" style={{ marginTop: 0 }} onClick={() => remove(m.id)}>
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
