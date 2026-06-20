'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import type { AdminOrg } from '../../lib/types';

/** Panel super-admin: activar/extender/suspender suscripciones tras la transferencia (§7). */
export default function AdminPage() {
  const [orgs, setOrgs] = useState<AdminOrg[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ planNombre: 'Básico', estado: 'activa', fin: '' });
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<AdminOrg[]>('/api/admin/organizations')
      .then(setOrgs)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));
  }, []);

  useEffect(load, [load]);

  async function save(orgId: string) {
    setError('');
    try {
      await api(`/api/admin/organizations/${orgId}/subscriptions`, {
        method: 'POST',
        body: {
          planNombre: form.planNombre,
          estado: form.estado,
          fin: form.fin ? new Date(form.fin).toISOString() : undefined,
          metodoPago: 'transferencia',
        },
      });
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  return (
    <main>
      <Link href="/app">← Volver</Link>
      <h1>Suscripciones (super-admin)</h1>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Plan</th>
              <th>Estado</th>
              <th>Miembros</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.id}>
                <td>
                  {org.nombre}
                  {org.rnc && <span className="muted"> · {org.rnc}</span>}
                </td>
                <td>{org.plan?.nombre ?? '—'}</td>
                <td>
                  <span className="badge">{org.estadoSuscripcion ?? 'inactiva'}</span>
                </td>
                <td>{org._count.memberships}</td>
                <td style={{ textAlign: 'right' }}>
                  <a style={{ cursor: 'pointer' }} onClick={() => setEditing(org.id)}>
                    Cambiar
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="card">
          <h2>Actualizar suscripción</h2>
          <div className="row">
            <div>
              <label>Plan</label>
              <select
                value={form.planNombre}
                onChange={(e) => setForm((f) => ({ ...f, planNombre: e.target.value }))}
              >
                <option>Básico</option>
                <option>Pro</option>
                <option>Empresarial</option>
              </select>
            </div>
            <div>
              <label>Estado</label>
              <select
                value={form.estado}
                onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}
              >
                <option value="activa">activa</option>
                <option value="suspendida">suspendida</option>
                <option value="vencida">vencida</option>
                <option value="cancelada">cancelada</option>
              </select>
            </div>
            <div>
              <label>Vence (opcional)</label>
              <input
                type="date"
                value={form.fin}
                onChange={(e) => setForm((f) => ({ ...f, fin: e.target.value }))}
              />
            </div>
            <div style={{ flex: '0 0 auto' }}>
              <button onClick={() => save(editing)}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
