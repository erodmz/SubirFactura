'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../../lib/api';
import InviteMemberModal from '../../../../components/InviteMemberModal';
import { useConfirm } from '../../../../components/ConfirmDialog';
import type { Member } from '../../../../lib/types';

type RolFiltro = 'todos' | 'org_admin' | 'contador' | 'cliente';

const FILTROS: { key: RolFiltro; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'org_admin', label: 'Administradores' },
  { key: 'contador', label: 'Contadores' },
  { key: 'cliente', label: 'Clientes' },
];

function initials(nombre: string, email: string) {
  const n = nombre?.trim();
  if (n) {
    const p = n.split(/\s+/);
    return (p[0][0] + (p[1]?.[0] ?? '')).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export default function MembersPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [members, setMembers] = useState<Member[]>([]);
  const [clientes, setClientes] = useState<{ id: string; razonSocial: string }[]>([]);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<RolFiltro>('todos');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [error, setError] = useState('');
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(() => {
    api<Member[]>(`/api/organizations/${orgId}/members`).then(setMembers).catch(() => {});
    api<{ id: string; razonSocial: string }[]>(`/api/organizations/${orgId}/clients`)
      .then(setClientes)
      .catch(() => {});
  }, [orgId]);

  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return members.filter((m) => {
      if (filtro !== 'todos' && m.rol !== filtro) return false;
      if (!term) return true;
      return (
        m.user.nombre.toLowerCase().includes(term) ||
        m.user.email.toLowerCase().includes(term)
      );
    });
  }, [members, filtro, q]);

  const cuentaPorRol = useMemo(() => {
    const c: Record<string, number> = { todos: members.length };
    for (const m of members) c[m.rol] = (c[m.rol] ?? 0) + 1;
    return c;
  }, [members]);

  const selectedMembers = members.filter((m) => selected.has(m.id));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }
  function toggleAll() {
    const visibles = filtered.map((m) => m.id);
    const todosSel = visibles.length > 0 && visibles.every((id) => selected.has(id));
    setSelected(todosSel ? new Set() : new Set(visibles));
  }

  async function changeRole(id: string, rol: string) {
    setError('');
    try {
      await api(`/api/organizations/${orgId}/members/${id}`, { method: 'PATCH', body: { rol } });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
      load();
    }
  }

  async function setFlag(
    id: string,
    campo: 'puedeValidar' | 'puedeVerReportes',
    valor: boolean,
    endpoint: string,
  ) {
    setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, [campo]: valor } : m)));
    try {
      await api(`/api/organizations/${orgId}/members/${id}/${endpoint}`, {
        method: 'PATCH',
        body: { [campo]: valor },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
      load();
    }
  }

  async function remove(m: Member) {
    const ok = await confirm({
      title: 'Quitar del equipo',
      message: `¿Quitar a ${m.user.nombre} de la organización?`,
      confirmLabel: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    setError('');
    try {
      await api(`/api/organizations/${orgId}/members/${m.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  async function bulkRemove() {
    const ok = await confirm({
      title: 'Quitar del equipo',
      message: `¿Quitar a ${selectedMembers.length} persona(s) de la organización?`,
      confirmLabel: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    setError('');
    const results = await Promise.all(
      selectedMembers.map((m) =>
        api(`/api/organizations/${orgId}/members/${m.id}`, { method: 'DELETE' })
          .then(() => true)
          .catch(() => false),
      ),
    );
    const fallidos = results.filter((r) => !r).length;
    if (fallidos > 0) {
      setError(`${fallidos} no se pudieron quitar (¿el último administrador?).`);
    }
    setSelected(new Set());
    load();
  }

  const visibles = filtered.map((m) => m.id);
  const allSel = visibles.length > 0 && visibles.every((id) => selected.has(id));
  const someSel = visibles.some((id) => selected.has(id)) && !allSel;

  return (
    <>
      {confirmDialog}

      <div className="page-head">
        <h1>Equipo</h1>
        <span className="count-pill">{members.length}</span>
        <div className="spacer" />
        <button onClick={() => setInviteOpen(true)} style={{ margin: 0 }}>+ Invitar</button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="page-tools">
        <div className="seg" role="group" aria-label="Filtrar por rol">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`seg-item${filtro === f.key ? ' active' : ''}`}
              onClick={() => setFiltro(f.key)}
            >
              {f.label}
              <span style={{ marginLeft: 6, opacity: 0.7 }}>{cuentaPorRol[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="spacer" />
        <div className="select-search" style={{ maxWidth: 260 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o correo…"
            aria-label="Buscar miembro"
          />
        </div>
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">{selected.size} seleccionado(s)</span>
          <div className="spacer" />
          <button type="button" className="danger" onClick={bulkRemove}>Quitar del equipo</button>
          <button type="button" className="secondary" onClick={() => setSelected(new Set())}>
            Limpiar
          </button>
        </div>
      )}

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th className="dt-check">
                  <input
                    type="checkbox"
                    checked={allSel}
                    ref={(el) => { if (el) el.indeterminate = someSel; }}
                    onChange={toggleAll}
                    aria-label="Seleccionar todo"
                  />
                </th>
                <th>Miembro</th>
                <th>Rol</th>
                <th>Puede validar</th>
                <th>Ve reportes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const sel = selected.has(m.id);
                return (
                  <tr key={m.id} className={sel ? 'row-selected' : undefined}>
                    <td className="dt-check">
                      <input
                        type="checkbox"
                        checked={sel}
                        onChange={() => toggle(m.id)}
                        aria-label={`Seleccionar ${m.user.nombre}`}
                      />
                    </td>
                    <td>
                      <div className="person-cell">
                        <span className="avatar">{initials(m.user.nombre, m.user.email)}</span>
                        <div>
                          <div className="person-name">{m.user.nombre}</div>
                          <div className="person-sub">{m.user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select value={m.rol} onChange={(e) => changeRole(m.id, e.target.value)}>
                        <option value="org_admin">Administrador</option>
                        <option value="contador">Contador</option>
                        <option value="cliente">Cliente</option>
                      </select>
                    </td>
                    <td>
                      {m.rol === 'cliente' ? (
                        <label className="toggle-cell" title="Permite a este cliente validar facturas (no solo guardarlas)">
                          <input
                            type="checkbox"
                            checked={m.puedeValidar ?? false}
                            onChange={(e) => setFlag(m.id, 'puedeValidar', e.target.checked, 'validate-permission')}
                          />
                          {m.puedeValidar ? 'Sí' : 'No'}
                        </label>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {m.rol === 'cliente' ? (
                        <label className="toggle-cell" title="Permite a este cliente ver el resumen de gastos en la app">
                          <input
                            type="checkbox"
                            checked={m.puedeVerReportes ?? false}
                            onChange={(e) => setFlag(m.id, 'puedeVerReportes', e.target.checked, 'reports-permission')}
                          />
                          {m.puedeVerReportes ? 'Sí' : 'No'}
                        </label>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="link-btn danger-link"
                        onClick={() => remove(m)}
                        aria-label={`Quitar a ${m.user.nombre}`}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    {q || filtro !== 'todos'
                      ? 'Nadie coincide con el filtro'
                      : 'Aún no hay miembros'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {inviteOpen && (
        <InviteMemberModal
          orgId={orgId}
          clientes={clientes}
          onClose={() => setInviteOpen(false)}
          onInvited={load}
        />
      )}
    </>
  );
}
