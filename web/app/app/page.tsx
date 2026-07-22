'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, apiUrl, clearTokens, getTokens } from '../../lib/api';
import ThemeToggle from '../../components/ThemeToggle';
import Logo from '../../components/Logo';
import Dropdown from '../../components/Dropdown';
import VerifyEmailBanner from '../../components/VerifyEmailBanner';
import type { Me } from '../../lib/types';

type Membership = Me['memberships'][number];

const PAGE_GRID = 12;
const PAGE_LIST = 15;
// A partir de acá aparece la barra de herramientas (búsqueda/orden/vista).
const TOOLBAR_FROM = 6;

export default function HomePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');

  const [q, setQ] = useState('');
  const [sort, setSort] = useState('az');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!getTokens()) {
      router.replace('/login');
      return;
    }
    api<Me>('/api/me').then(setMe).catch(() => {});
    try {
      const v = localStorage.getItem('facturard-orgview');
      if (v === 'list' || v === 'grid') setView(v);
    } catch {
      /* ignore */
    }
  }, [router]);

  function setViewPersist(v: 'grid' | 'list') {
    setView(v);
    setPage(0);
    try {
      localStorage.setItem('facturard-orgview', v);
    } catch {
      /* ignore */
    }
  }

  function logout() {
    clearTokens();
    router.replace('/');
  }

  const all = me?.memberships ?? [];
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = term
      ? all.filter((m) => m.organization.nombre.toLowerCase().includes(term))
      : [...all];
    list.sort((a, b) => {
      if (sort === 'za') return b.organization.nombre.localeCompare(a.organization.nombre);
      if (sort === 'rol') return a.rol.localeCompare(b.rol) || a.organization.nombre.localeCompare(b.organization.nombre);
      return a.organization.nombre.localeCompare(b.organization.nombre);
    });
    return list;
  }, [all, q, sort]);

  const pageSize = view === 'grid' ? PAGE_GRID : PAGE_LIST;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const shown = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const showToolbar = all.length > TOOLBAR_FROM;

  const primerNombre = me?.nombre?.split(' ')[0] ?? '';

  return (
    <>
      <div className="topbar">
        {/* Sin enlace a propósito: desde el selector, el logo no navega. */}
        <Logo />
        <div style={{ flex: 1 }} />
        {me?.isSuperAdmin && <Link href="/admin">Panel super-admin</Link>}
        <Link href="/settings">Mi cuenta</Link>
        <ThemeToggle />
        <button type="button" className="link-btn" onClick={logout}>
          Salir
        </button>
      </div>
      <main className="select-page">
        {!me ? (
          <p className="muted">Cargando…</p>
        ) : (
          <>
            {me.emailVerified === false && <VerifyEmailBanner email={me.email} />}
            <div className="select-head">
              <div>
                <h1 className="greeting">Hola{primerNombre ? `, ${primerNombre}` : ''} 👋</h1>
                <p className="muted greeting-sub">
                  {all.length === 0
                    ? 'Crea tu empresa contable para empezar — es el espacio de tu despacho.'
                    : all.length > 1
                      ? `Elige una empresa para continuar · ${all.length} en total`
                      : 'Elige una empresa para continuar.'}
                </p>
              </div>
              <button onClick={() => router.push('/onboarding')} style={{ margin: 0 }}>
                + Crear empresa
              </button>
            </div>

            {error && <div className="error">{error}</div>}

            {showToolbar && (
              <div className="select-toolbar">
                <div className="select-search">
                  <span aria-hidden>🔍</span>
                  <input
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setPage(0);
                    }}
                    placeholder="Buscar empresa…"
                    aria-label="Buscar empresa"
                  />
                  {q && (
                    <button type="button" className="select-clear" onClick={() => setQ('')} aria-label="Limpiar">
                      ✕
                    </button>
                  )}
                </div>
                <Dropdown
                  ariaLabel="Ordenar"
                  icon={<span aria-hidden>↕</span>}
                  value={sort}
                  onChange={(v) => {
                    setSort(v);
                    setPage(0);
                  }}
                  options={[
                    { value: 'az', label: 'Nombre (A–Z)' },
                    { value: 'za', label: 'Nombre (Z–A)' },
                    { value: 'rol', label: 'Rol' },
                  ]}
                />
                <div className="view-toggle" role="group" aria-label="Vista">
                  <button
                    className={view === 'grid' ? 'active' : ''}
                    onClick={() => setViewPersist('grid')}
                    aria-label="Vista de tarjetas"
                    title="Tarjetas"
                  >
                    ▦
                  </button>
                  <button
                    className={view === 'list' ? 'active' : ''}
                    onClick={() => setViewPersist('list')}
                    aria-label="Vista de lista"
                    title="Lista"
                  >
                    ☰
                  </button>
                </div>
              </div>
            )}

            {filtered.length === 0 ? (
              all.length === 0 ? (
                <div className="card" style={{ marginTop: 20, maxWidth: 460 }}>
                  <strong>Aún no tienes una empresa contable</strong>
                  <p className="muted" style={{ margin: '6px 0 12px' }}>
                    Créala para tener tu espacio de despacho: desde ahí agregas a tus clientes y
                    empiezas a recibir sus facturas.
                  </p>
                  <button onClick={() => router.push('/onboarding')}>+ Crear empresa contable</button>
                </div>
              ) : (
                <p className="muted" style={{ marginTop: 20 }}>
                  Ninguna empresa coincide con “{q}”.
                </p>
              )
            ) : view === 'list' && showToolbar ? (
              <div className="org-list">
                {shown.map((m) => (
                  <OrgRow key={m.membershipId} m={m} />
                ))}
              </div>
            ) : (
              <div className="org-grid">
                {shown.map((m) => (
                  <OrgTile key={m.membershipId} m={m} />
                ))}
                {!showToolbar && (
                  <button className="org-card org-card-new" onClick={() => router.push('/onboarding')}>
                    <span className="org-initial org-initial-ghost">+</span>
                    <strong>Crear empresa contable</strong>
                    <span className="muted">Añade un despacho nuevo</span>
                  </button>
                )}
              </div>
            )}

            {pages > 1 && (
              <div className="paginator">
                <button
                  className="secondary"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                >
                  ‹ Anterior
                </button>
                <span className="muted">
                  Página {safePage + 1} de {pages} · {filtered.length} empresas
                </span>
                <button
                  className="secondary"
                  onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                  disabled={safePage >= pages - 1}
                >
                  Siguiente ›
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

function OrgTile({ m }: { m: Membership }) {
  return (
    <Link href={`/orgs/${m.organization.id}`} className="org-card">
      {m.organization.logoUrl ? (
        <span className="org-logo">
          <img src={apiUrl(m.organization.logoUrl)} alt={m.organization.nombre} />
        </span>
      ) : (
        <span className="org-initial">{m.organization.nombre.charAt(0).toUpperCase()}</span>
      )}
      <strong>{m.organization.nombre}</strong>
      <span className="badge">{m.rol}</span>
      {m.organization.estadoAprobacion === 'pendiente' && (
        <span className="badge">🕵️ en revisión</span>
      )}
      {m.organization.estadoAprobacion === 'rechazada' && (
        <span className="badge">verificación rechazada</span>
      )}
    </Link>
  );
}

function OrgRow({ m }: { m: Membership }) {
  return (
    <Link href={`/orgs/${m.organization.id}`} className="org-row">
      {m.organization.logoUrl ? (
        <span className="org-logo sm">
          <img src={apiUrl(m.organization.logoUrl)} alt={m.organization.nombre} />
        </span>
      ) : (
        <span className="org-initial sm">{m.organization.nombre.charAt(0).toUpperCase()}</span>
      )}
      <strong className="org-row-name">{m.organization.nombre}</strong>
      <span className="badge">{m.rol}</span>
      {m.organization.estadoAprobacion === 'pendiente' && (
        <span className="badge">🕵️ en revisión</span>
      )}
      {m.organization.estadoAprobacion === 'rechazada' && (
        <span className="badge">verificación rechazada</span>
      )}
      <span className="org-row-chev" aria-hidden>
        ›
      </span>
    </Link>
  );
}
