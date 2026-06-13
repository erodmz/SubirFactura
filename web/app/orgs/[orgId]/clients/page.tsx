'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../../lib/api';
import type { Client, Member } from '../../../../lib/types';

export default function ClientsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [clients, setClients] = useState<Client[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [expanded, setExpanded] = useState<Client | null>(null);
  const [clientUsers, setClientUsers] = useState<{ id: string; nombre: string; email: string }[]>([]);
  const [form, setForm] = useState({ rncOCedula: '', razonSocial: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    api<Client[]>(`/api/organizations/${orgId}/clients`).then(setClients).catch(() => {});
    api<Member[]>(`/api/organizations/${orgId}/members`).then(setMembers).catch(() => {});
  }, [orgId]);

  useEffect(load, [load]);

  async function createClient(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      const created = await api<Client>(`/api/organizations/${orgId}/clients`, {
        method: 'POST',
        body: form,
      });
      if (created.limitWarning) setNotice(created.limitWarning);
      setForm({ rncOCedula: '', razonSocial: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  async function openDetail(client: Client) {
    const [detail, users] = await Promise.all([
      api<Client>(`/api/organizations/${orgId}/clients/${client.id}`),
      api<{ id: string; nombre: string; email: string }[]>(
        `/api/organizations/${orgId}/clients/${client.id}/members`,
      ),
    ]);
    setExpanded(detail);
    setClientUsers(users);
  }

  async function addMember(clientId: string, userId: string) {
    setError('');
    try {
      await api(`/api/organizations/${orgId}/clients/${clientId}/members`, {
        method: 'POST',
        body: { userId },
      });
      await openDetail({ id: clientId } as Client);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  async function removeMember(clientId: string, userId: string) {
    setError('');
    try {
      await api(`/api/organizations/${orgId}/clients/${clientId}/members/${userId}`, {
        method: 'DELETE',
      });
      await openDetail({ id: clientId } as Client);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  async function assign(clientId: string, contadorMembershipId: string) {
    setError('');
    try {
      await api(`/api/organizations/${orgId}/clients/${clientId}/assignments`, {
        method: 'POST',
        body: { contadorMembershipId },
      });
      await openDetail({ id: clientId } as Client);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  async function unassign(clientId: string, contadorMembershipId: string) {
    await api(
      `/api/organizations/${orgId}/clients/${clientId}/assignments/${contadorMembershipId}`,
      { method: 'DELETE' },
    );
    await openDetail({ id: clientId } as Client);
  }

  async function removeClient(clientId: string) {
    if (!confirm('¿Eliminar este cliente?')) return;
    setError('');
    try {
      await api(`/api/organizations/${orgId}/clients/${clientId}`, { method: 'DELETE' });
      setExpanded(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  const contadores = members.filter((m) => m.rol === 'contador');

  return (
    <>
      <h1>Clientes</h1>
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <div className="card">
        <h2>Nuevo cliente</h2>
        <form onSubmit={createClient}>
          <div className="row">
            <div>
              <label>RNC o cédula</label>
              <input
                value={form.rncOCedula}
                onChange={(e) => setForm((f) => ({ ...f, rncOCedula: e.target.value }))}
                required
              />
            </div>
            <div>
              <label>Razón social / nombre</label>
              <input
                value={form.razonSocial}
                onChange={(e) => setForm((f) => ({ ...f, razonSocial: e.target.value }))}
                required
              />
            </div>
            <div style={{ flex: '0 0 auto' }}>
              <button>Agregar</button>
            </div>
          </div>
        </form>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Razón social</th>
              <th>RNC / Cédula</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td>{c.razonSocial}</td>
                <td>{c.rncOCedula}</td>
                <td style={{ textAlign: 'right' }}>
                  <a style={{ cursor: 'pointer' }} onClick={() => openDetail(c)}>
                    Gestionar
                  </a>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  Sin clientes todavía
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {expanded && (
        <div className="card">
          <h2>
            {expanded.razonSocial} <span className="badge">{expanded.rncOCedula}</span>
          </h2>
          <h3 className="muted">Contadores asignados</h3>
          <table>
            <tbody>
              {(expanded.contadores ?? []).map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.user.nombre} <span className="muted">({m.user.email})</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="danger"
                      style={{ marginTop: 0 }}
                      onClick={() => unassign(expanded.id, m.id)}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
              {(expanded.contadores ?? []).length === 0 && (
                <tr>
                  <td className="muted">Nadie asignado</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="row">
            <div>
              <label>Asignar contador</label>
              <select
                defaultValue=""
                onChange={(e) => e.target.value && assign(expanded.id, e.target.value)}
              >
                <option value="">Seleccionar…</option>
                {contadores.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.user.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: '0 0 auto' }}>
              <button className="danger" onClick={() => removeClient(expanded.id)}>
                Eliminar cliente
              </button>
            </div>
          </div>

          <h3 className="muted" style={{ marginTop: 24 }}>
            Usuarios que suben facturas
          </h3>
          <p className="muted">
            Las personas de este negocio que cargan facturas desde la app móvil.
          </p>
          <table>
            <tbody>
              {clientUsers.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.nombre} <span className="muted">({u.email})</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="danger"
                      style={{ marginTop: 0 }}
                      onClick={() => removeMember(expanded.id, u.id)}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
              {clientUsers.length === 0 && (
                <tr>
                  <td className="muted">Nadie habilitado todavía</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="row">
            <div>
              <label>Habilitar usuario</label>
              <select
                value=""
                onChange={(e) => e.target.value && addMember(expanded.id, e.target.value)}
              >
                <option value="">Seleccionar…</option>
                {members
                  .filter((m) => !clientUsers.some((u) => u.id === m.user.id))
                  .map((m) => (
                    <option key={m.id} value={m.user.id}>
                      {m.user.nombre} ({m.rol})
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            ¿No está en la lista? Invítalo primero en <strong>Equipo</strong> (rol cliente) y luego
            habilítalo aquí.
          </p>
        </div>
      )}
    </>
  );
}
