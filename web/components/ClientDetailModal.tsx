'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import Modal from './Modal';
import type { Client, Member } from '../lib/types';
import type { ConfirmOptions } from './ConfirmDialog';

interface ClientUser {
  id: string;
  nombre: string;
  email: string;
}

function initials(nombre: string, email: string) {
  const n = nombre?.trim();
  if (n) {
    const p = n.split(/\s+/);
    return (p[0][0] + (p[1]?.[0] ?? '')).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

/** Panel de gestión de un cliente: contadores asignados y usuarios que suben. */
export default function ClientDetailModal({
  orgId,
  clientId,
  members,
  onClose,
  onChanged,
  onEdit,
  confirm,
}: {
  orgId: string;
  clientId: string;
  members: Member[];
  onClose: () => void;
  onChanged: () => void;
  onEdit: (c: Client) => void;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
}) {
  const [client, setClient] = useState<Client | null>(null);
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const [detail, u] = await Promise.all([
        api<Client>(`/api/organizations/${orgId}/clients/${clientId}`),
        api<ClientUser[]>(`/api/organizations/${orgId}/clients/${clientId}/members`),
      ]);
      setClient(detail);
      setUsers(u);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }, [orgId, clientId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const wrap = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      await reload();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  };

  const assign = (mid: string) =>
    wrap(() =>
      api(`/api/organizations/${orgId}/clients/${clientId}/assignments`, {
        method: 'POST',
        body: { contadorMembershipId: mid },
      }),
    );
  const unassign = (mid: string) =>
    wrap(() =>
      api(`/api/organizations/${orgId}/clients/${clientId}/assignments/${mid}`, {
        method: 'DELETE',
      }),
    );
  const addUser = (userId: string) =>
    wrap(() =>
      api(`/api/organizations/${orgId}/clients/${clientId}/members`, {
        method: 'POST',
        body: { userId },
      }),
    );
  const removeUser = (userId: string) =>
    wrap(() =>
      api(`/api/organizations/${orgId}/clients/${clientId}/members/${userId}`, {
        method: 'DELETE',
      }),
    );

  async function del() {
    const ok = await confirm({
      title: 'Eliminar cliente',
      message: `¿Eliminar a "${client?.razonSocial}"? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    await wrap(() =>
      api(`/api/organizations/${orgId}/clients/${clientId}`, { method: 'DELETE' }),
    );
    onClose();
  }

  const contadores = members.filter((m) => m.rol === 'contador');
  const asignados = client?.contadores ?? [];
  const sinAsignar = contadores.filter((c) => !asignados.some((a) => a.id === c.id));
  const habilitables = members.filter((m) => !users.some((u) => u.id === m.user.id));

  return (
    <Modal
      title={
        client ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {client.razonSocial}
            <span className="badge">{client.rncOCedula}</span>
          </span>
        ) : (
          'Cargando…'
        )
      }
      onClose={onClose}
      width={620}
      footer={
        <>
          <button type="button" className="danger" onClick={del} style={{ marginRight: 'auto' }}>
            Eliminar cliente
          </button>
          {client && (
            <button type="button" className="secondary" onClick={() => onEdit(client)}>
              Editar nombre
            </button>
          )}
          <button type="button" onClick={onClose}>
            Listo
          </button>
        </>
      }
    >
      {error && <div className="error" style={{ marginBottom: 14 }}>{error}</div>}

      <section style={{ marginBottom: 22 }}>
        <div className="detail-section-head">
          <h3>Contadores asignados</h3>
          <span className="mini-chip">{asignados.length}</span>
        </div>
        <div className="chip-list">
          {asignados.map((m) => (
            <span key={m.id} className="entity-chip">
              <span className="avatar" style={{ width: 24, height: 24, fontSize: 10 }}>
                {initials(m.user.nombre, m.user.email)}
              </span>
              {m.user.nombre}
              <button
                type="button"
                className="chip-x"
                onClick={() => unassign(m.id)}
                aria-label={`Quitar a ${m.user.nombre}`}
                title="Quitar"
              >
                ✕
              </button>
            </span>
          ))}
          {asignados.length === 0 && <span className="muted">Nadie asignado todavía.</span>}
        </div>
        {sinAsignar.length > 0 && (
          <select
            value=""
            onChange={(e) => e.target.value && assign(e.target.value)}
            style={{ marginTop: 10, maxWidth: 280 }}
          >
            <option value="">+ Asignar contador…</option>
            {sinAsignar.map((m) => (
              <option key={m.id} value={m.id}>
                {m.user.nombre}
              </option>
            ))}
          </select>
        )}
      </section>

      <section>
        <div className="detail-section-head">
          <h3>Usuarios que suben facturas</h3>
          <span className="mini-chip">{users.length}</span>
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Personas de este negocio que cargan facturas desde la app móvil.
        </p>
        <div className="chip-list">
          {users.map((u) => (
            <span key={u.id} className="entity-chip">
              <span className="avatar" style={{ width: 24, height: 24, fontSize: 10 }}>
                {initials(u.nombre, u.email)}
              </span>
              {u.nombre}
              <button
                type="button"
                className="chip-x"
                onClick={() => removeUser(u.id)}
                aria-label={`Quitar a ${u.nombre}`}
                title="Quitar"
              >
                ✕
              </button>
            </span>
          ))}
          {users.length === 0 && <span className="muted">Nadie habilitado todavía.</span>}
        </div>
        {habilitables.length > 0 ? (
          <select
            value=""
            onChange={(e) => e.target.value && addUser(e.target.value)}
            style={{ marginTop: 10, maxWidth: 280 }}
          >
            <option value="">+ Habilitar usuario…</option>
            {habilitables.map((m) => (
              <option key={m.id} value={m.user.id}>
                {m.user.nombre} ({m.rol})
              </option>
            ))}
          </select>
        ) : (
          <p className="muted" style={{ fontSize: 13 }}>
            ¿No está en la lista? Invítalo primero en <strong>Equipo</strong> (rol cliente) y luego
            habilítalo aquí.
          </p>
        )}
      </section>
    </Modal>
  );
}
