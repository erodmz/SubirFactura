'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, apiUrl } from '../../../../lib/api';
import DataTable from '../../../../components/DataTable';
import ClientFormModal from '../../../../components/ClientFormModal';
import ClientDetailModal from '../../../../components/ClientDetailModal';
import { useConfirm } from '../../../../components/ConfirmDialog';
import type { Client, Member } from '../../../../lib/types';

type View = 'table' | 'cards';

export default function ClientsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [clients, setClients] = useState<Client[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>('table');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [bulkAssign, setBulkAssign] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(() => {
    api<Client[]>(`/api/organizations/${orgId}/clients`).then(setClients).catch(() => {});
    api<Member[]>(`/api/organizations/${orgId}/members`).then(setMembers).catch(() => {});
  }, [orgId]);

  useEffect(load, [load]);

  const contadores = useMemo(() => members.filter((m) => m.rol === 'contador'), [members]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter(
      (c) =>
        c.razonSocial.toLowerCase().includes(term) ||
        c.rncOCedula.toLowerCase().includes(term),
    );
  }, [clients, q]);

  const selectedClients = clients.filter((c) => selected.has(c.id));

  function clearSelection() {
    setSelected(new Set());
    setBulkAssign('');
  }

  async function doBulkAssign(mid: string) {
    if (!mid) return;
    setError('');
    try {
      await Promise.all(
        selectedClients.map((c) =>
          api(`/api/organizations/${orgId}/clients/${c.id}/assignments`, {
            method: 'POST',
            body: { contadorMembershipId: mid },
          }).catch(() => null),
        ),
      );
      const nombre = contadores.find((m) => m.id === mid)?.user.nombre ?? 'el contador';
      setNotice(`Se asignó ${nombre} a ${selectedClients.length} cliente(s).`);
      clearSelection();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  async function doBulkDelete() {
    const ok = await confirm({
      title: 'Eliminar clientes',
      message: `¿Eliminar ${selectedClients.length} cliente(s)? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    setError('');
    const results = await Promise.all(
      selectedClients.map((c) =>
        api(`/api/organizations/${orgId}/clients/${c.id}`, { method: 'DELETE' })
          .then(() => true)
          .catch(() => false),
      ),
    );
    const fallidos = results.filter((r) => !r).length;
    if (fallidos > 0) {
      setError(
        `${fallidos} cliente(s) no se pudieron eliminar (quizás tienen facturas asociadas).`,
      );
    } else {
      setNotice(`Se eliminaron ${results.length} cliente(s).`);
    }
    clearSelection();
    load();
  }

  function onSaved(c: Client, isEdit: boolean) {
    if (c.limitWarning) setNotice(c.limitWarning);
    else setNotice(isEdit ? 'Cliente actualizado.' : `Cliente "${c.razonSocial}" creado.`);
    setFormOpen(false);
    setEditClient(null);
    load();
  }

  return (
    <>
      {confirmDialog}

      <div className="page-head">
        <h1>Clientes</h1>
        <span className="count-pill">{clients.length}</span>
        <div className="spacer" />
        <button onClick={() => { setEditClient(null); setFormOpen(true); }} style={{ margin: 0 }}>
          + Nuevo cliente
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <div className="page-tools">
        <div className="select-search" style={{ maxWidth: 300 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o RNC…"
            aria-label="Buscar cliente"
          />
        </div>
        <div className="spacer" />
        <div className="view-toggle" role="group" aria-label="Vista">
          <button
            type="button"
            className={view === 'table' ? 'active' : ''}
            onClick={() => setView('table')}
            aria-label="Vista de tabla"
            title="Tabla"
          >
            ▤
          </button>
          <button
            type="button"
            className={view === 'cards' ? 'active' : ''}
            onClick={() => setView('cards')}
            aria-label="Vista de tarjetas"
            title="Tarjetas"
          >
            ▦
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">{selected.size} seleccionado(s)</span>
          <div className="spacer" />
          <select
            value={bulkAssign}
            onChange={(e) => { setBulkAssign(e.target.value); doBulkAssign(e.target.value); }}
            aria-label="Asignar contador a los seleccionados"
          >
            <option value="">Asignar contador…</option>
            {contadores.map((m) => (
              <option key={m.id} value={m.id}>{m.user.nombre}</option>
            ))}
          </select>
          <button type="button" className="danger" onClick={doBulkDelete}>
            Eliminar
          </button>
          <button type="button" className="secondary" onClick={clearSelection}>
            Limpiar
          </button>
        </div>
      )}

      {view === 'table' ? (
        <div className="card">
          <DataTable
            rows={filtered}
            getKey={(c) => c.id}
            initialSort={{ key: 'razonSocial', dir: 'asc' }}
            exportFileName="clientes"
            emptyText={q ? 'Ningún cliente coincide con la búsqueda' : 'Sin clientes todavía'}
            selection={{ selected, onChange: setSelected }}
            columns={[
              {
                key: 'razonSocial',
                header: 'Razón social',
                value: (c) => c.razonSocial,
                render: (c) => (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <ClientLogo c={c} size={24} />
                    {c.razonSocial}
                  </span>
                ),
              },
              { key: 'rncOCedula', header: 'RNC / Cédula', value: (c) => c.rncOCedula },
              {
                key: 'contadores',
                header: 'Contadores',
                align: 'right',
                value: (c) => c._count?.assignments ?? 0,
                render: (c) => <span className="mini-chip">{c._count?.assignments ?? 0}</span>,
              },
              {
                key: 'usuarios',
                header: 'Usuarios',
                align: 'right',
                value: (c) => c._count?.members ?? 0,
                render: (c) => <span className="mini-chip">{c._count?.members ?? 0}</span>,
              },
              {
                key: 'facturas',
                header: 'Facturas',
                align: 'right',
                value: (c) => c._count?.invoices ?? 0,
                render: (c) => <span className="mini-chip">{c._count?.invoices ?? 0}</span>,
              },
              {
                key: 'accion',
                header: '',
                align: 'right',
                render: (c) => (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setDetailId(c.id)}
                    aria-label={`Gestionar ${c.razonSocial}`}
                  >
                    Gestionar
                  </button>
                ),
              },
            ]}
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            {q ? 'Ningún cliente coincide con la búsqueda' : 'Sin clientes todavía'}
          </p>
        </div>
      ) : (
        <div className="card-grid">
          {filtered.map((c) => {
            const sel = selected.has(c.id);
            return (
              <div key={c.id} className={`entity-card${sel ? ' selected' : ''}`}>
                <span className="ec-check">
                  <input
                    type="checkbox"
                    checked={sel}
                    onChange={() => {
                      const next = new Set(selected);
                      if (next.has(c.id)) next.delete(c.id);
                      else next.add(c.id);
                      setSelected(next);
                    }}
                    aria-label={`Seleccionar ${c.razonSocial}`}
                  />
                </span>
                <div className="ec-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ClientLogo c={c} size={28} />
                  {c.razonSocial}
                </div>
                <div className="ec-meta">RNC / Cédula · {c.rncOCedula}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className="mini-chip">👤 {c._count?.assignments ?? 0} contador(es)</span>
                  <span className="mini-chip">📄 {c._count?.invoices ?? 0}</span>
                </div>
                <div className="ec-actions">
                  <button type="button" className="secondary" onClick={() => setDetailId(c.id)}>
                    Gestionar
                  </button>
                  <button type="button" className="secondary" onClick={() => { setEditClient(c); setFormOpen(true); }}>
                    Editar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <ClientFormModal
          orgId={orgId}
          edit={editClient ?? undefined}
          onClose={() => { setFormOpen(false); setEditClient(null); }}
          onSaved={(c) => onSaved(c, !!editClient)}
        />
      )}

      {detailId && (
        <ClientDetailModal
          orgId={orgId}
          clientId={detailId}
          members={members}
          confirm={confirm}
          onClose={() => setDetailId(null)}
          onChanged={load}
          onEdit={(c) => { setDetailId(null); setEditClient(c); setFormOpen(true); }}
        />
      )}
    </>
  );
}

/** Logo pequeño del cliente; sin logo, la inicial del negocio como fallback. */
function ClientLogo({ c, size }: { c: Client; size: number }) {
  const base: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: 6,
    border: '1px solid var(--border)',
    flexShrink: 0,
  };
  if (c.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={apiUrl(c.logoUrl)}
        alt=""
        style={{ ...base, objectFit: 'cover', background: 'var(--bg-soft)' }}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{
        ...base,
        background: 'var(--bg-soft)',
        display: 'grid',
        placeItems: 'center',
        fontSize: size * 0.5,
        fontWeight: 700,
        color: 'var(--brand)',
      }}
    >
      {c.razonSocial.charAt(0).toUpperCase()}
    </span>
  );
}
