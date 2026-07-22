'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, apiObjectUrl } from '../../lib/api';
import SuccessCheck from '../../components/SuccessCheck';
import type { AdminCreatedOrg, AdminOrg } from '../../lib/types';

const PLANES = ['Básico', 'Pro', 'Empresarial'];

/**
 * Panel super-admin: el gestor de la plataforma (§7).
 * Crea empresas contadoras (plan + invitación a su org_admin), cambia planes
 * tras la transferencia y borra/restaura empresas (borrado lógico).
 */
export default function AdminPage() {
  const [orgs, setOrgs] = useState<AdminOrg[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ planNombre: 'Básico', estado: 'activa', fin: '' });
  const [error, setError] = useState('');

  // Crear empresa llave en mano
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    nombre: '',
    rnc: '',
    planNombre: 'Básico',
    adminEmail: '',
  });
  const [created, setCreated] = useState<AdminCreatedOrg | null>(null);
  const [copied, setCopied] = useState(false);
  const [approvedMsg, setApprovedMsg] = useState('');

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

  async function createOrg() {
    setError('');
    setCreated(null);
    try {
      const result = await api<AdminCreatedOrg>('/api/admin/organizations', {
        method: 'POST',
        body: {
          nombre: createForm.nombre,
          rnc: createForm.rnc || undefined,
          planNombre: createForm.planNombre,
          adminEmail: createForm.adminEmail || undefined,
        },
      });
      setCreated(result);
      setCreateForm({ nombre: '', rnc: '', planNombre: 'Básico', adminEmail: '' });
      setCreating(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  async function softDelete(org: AdminOrg) {
    if (
      !window.confirm(
        `¿Borrar "${org.nombre}"? Sus miembros dejarán de verla. Los datos se conservan y puedes restaurarla.`,
      )
    ) {
      return;
    }
    setError('');
    try {
      await api(`/api/admin/organizations/${org.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  async function restore(org: AdminOrg) {
    setError('');
    try {
      await api(`/api/admin/organizations/${org.id}/restore`, { method: 'POST' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  async function aprobar(org: AdminOrg) {
    setError('');
    try {
      await api(`/api/admin/organizations/${org.id}/aprobar`, { method: 'POST' });
      setApprovedMsg(`"${org.nombre}" aprobada — sus miembros ya pueden entrar`);
      setTimeout(() => setApprovedMsg(''), 3000);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  async function rechazar(org: AdminOrg) {
    const motivo = window.prompt(
      `Motivo del rechazo de "${org.nombre}" (el usuario lo verá y podrá resubir el documento):`,
    );
    if (!motivo?.trim()) return;
    setError('');
    try {
      await api(`/api/admin/organizations/${org.id}/rechazar`, {
        method: 'POST',
        body: { motivo: motivo.trim() },
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  /** El doc exige Authorization: se baja como blob y se abre en otra pestaña. */
  async function verDocumento(org: AdminOrg) {
    setError('');
    try {
      const url = await apiObjectUrl(`/api/admin/organizations/${org.id}/verificacion`);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el documento');
    }
  }

  async function copyInvite(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Búsqueda por nombre o RNC (el RNC se compara sin guiones ni espacios).
  const digits = (s: string) => s.replace(/[^0-9]/g, '');
  const query = search.trim().toLowerCase();
  const queryDigits = digits(query);
  const visible = query
    ? orgs.filter(
        (o) =>
          o.nombre.toLowerCase().includes(query) ||
          (queryDigits.length > 0 && o.rnc != null && digits(o.rnc).includes(queryDigits)),
      )
    : orgs;

  return (
    <main>
      <Link href="/app">← Volver</Link>
      <h1>Plataforma (super-admin)</h1>
      {error && <div className="error">{error}</div>}
      {approvedMsg && (
        <p
          className="anim-pop"
          style={{ color: 'var(--ok)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <SuccessCheck />
          {approvedMsg}
        </p>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Empresas contadoras</h2>
          <button type="button" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Cancelar' : '+ Crear empresa'}
          </button>
        </div>

        {creating && (
          <div className="row" style={{ marginTop: '1rem' }}>
            <div>
              <label>Nombre</label>
              <input
                value={createForm.nombre}
                onChange={(e) => setCreateForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Despacho Contable SRL"
              />
            </div>
            <div>
              <label>RNC (opcional)</label>
              <input
                value={createForm.rnc}
                onChange={(e) => setCreateForm((f) => ({ ...f, rnc: e.target.value }))}
                placeholder="1-01-00000-0"
              />
            </div>
            <div>
              <label>Plan</label>
              <select
                value={createForm.planNombre}
                onChange={(e) => setCreateForm((f) => ({ ...f, planNombre: e.target.value }))}
              >
                {PLANES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Correo del admin (opcional)</label>
              <input
                type="email"
                value={createForm.adminEmail}
                onChange={(e) => setCreateForm((f) => ({ ...f, adminEmail: e.target.value }))}
                placeholder="contador@despacho.do"
              />
            </div>
            <div style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}>
              <button type="button" onClick={createOrg} disabled={!createForm.nombre.trim()}>
                Crear
              </button>
            </div>
          </div>
        )}

        {created && (
          <div className="card anim-pop" style={{ marginTop: '1rem' }}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SuccessCheck />
              {created.nombre} creada (plan {created.plan.nombre})
            </strong>
            {created.invitation ? (
              <p style={{ marginBottom: 0 }}>
                Invitación de administrador para <strong>{created.invitation.email}</strong>{' '}
                (vence en 7 días). Compártela por WhatsApp o correo:
                <br />
                <code style={{ wordBreak: 'break-all' }}>{created.invitation.inviteUrl}</code>{' '}
                <button type="button" className="link-btn" onClick={() => copyInvite(created.invitation!.inviteUrl)}>
                  {copied ? '¡Copiado!' : 'Copiar enlace'}
                </button>
              </p>
            ) : (
              <p style={{ marginBottom: 0 }} className="muted">
                Sin invitación: agrega un administrador cuando quieras creando otra desde la empresa.
              </p>
            )}
          </div>
        )}

        <div style={{ marginTop: '1rem' }}>
          <input
            type="search"
            placeholder="Buscar por nombre o RNC…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar empresa por nombre o RNC"
          />
        </div>

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
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  {query ? 'Ninguna empresa coincide con la búsqueda.' : 'Aún no hay empresas.'}
                </td>
              </tr>
            )}
            {visible.map((org) => (
              <tr key={org.id} style={org.deletedAt ? { opacity: 0.55 } : undefined}>
                <td>
                  {org.nombre}
                  {org.rnc && <span className="muted"> · {org.rnc}</span>}
                  {org.deletedAt && <span className="badge"> borrada</span>}
                  {org.estadoAprobacion === 'pendiente' && (
                    <span className="badge"> 🕵️ por aprobar{org.verificacionDocKey ? ' · doc listo' : ' · sin doc'}</span>
                  )}
                  {org.estadoAprobacion === 'rechazada' && <span className="badge"> rechazada</span>}
                </td>
                <td>{org.plan?.nombre ?? '—'}</td>
                <td>
                  <span className="badge">{org.estadoSuscripcion ?? 'inactiva'}</span>
                </td>
                <td>{org._count.memberships}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {org.deletedAt ? (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => restore(org)}
                      aria-label={`Restaurar ${org.nombre}`}
                    >
                      Restaurar
                    </button>
                  ) : (
                    <>
                      {org.verificacionDocKey && (
                        <>
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => verDocumento(org)}
                            aria-label={`Ver documento de ${org.nombre}`}
                          >
                            Ver doc
                          </button>{' '}
                        </>
                      )}
                      {org.estadoAprobacion !== 'aprobada' && (
                        <>
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => aprobar(org)}
                            aria-label={`Aprobar ${org.nombre}`}
                          >
                            ✓ Aprobar
                          </button>{' '}
                          {org.estadoAprobacion !== 'rechazada' && (
                            <>
                              <button
                                type="button"
                                className="link-btn"
                                onClick={() => rechazar(org)}
                                aria-label={`Rechazar ${org.nombre}`}
                              >
                                Rechazar
                              </button>{' '}
                            </>
                          )}
                        </>
                      )}
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => setEditing(org.id)}
                        aria-label={`Cambiar plan de ${org.nombre}`}
                      >
                        Cambiar
                      </button>{' '}
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => softDelete(org)}
                        aria-label={`Borrar ${org.nombre}`}
                      >
                        Borrar
                      </button>
                    </>
                  )}
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
                {PLANES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
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
