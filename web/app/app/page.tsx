'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, clearTokens, getTokens } from '../../lib/api';
import ThemeToggle from '../../components/ThemeToggle';
import Logo from '../../components/Logo';
import type { Me } from '../../lib/types';

export default function HomePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [nombre, setNombre] = useState('');
  const [rnc, setRnc] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!getTokens()) {
      router.replace('/login');
      return;
    }
    api<Me>('/api/me').then(setMe).catch(() => {});
  }, [router]);

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const org = await api<{ id: string }>('/api/organizations', {
        method: 'POST',
        body: { nombre, rnc: rnc || undefined },
      });
      router.push(`/orgs/${org.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  function logout() {
    clearTokens();
    router.replace('/');
  }

  const primerNombre = me?.nombre?.split(' ')[0] ?? '';

  return (
    <>
      <div className="topbar">
        <Link href="/" aria-label="Inicio">
          <Logo />
        </Link>
        <div style={{ flex: 1 }} />
        {me?.isSuperAdmin && <Link href="/admin">Panel super-admin</Link>}
        <Link href="/settings">Mi cuenta</Link>
        <ThemeToggle />
        <a onClick={logout} style={{ cursor: 'pointer' }}>
          Salir
        </a>
      </div>
      <main className="select-page">
        {!me ? (
          <p className="muted">Cargando…</p>
        ) : (
          <>
            <h1 className="greeting">
              Hola{primerNombre ? `, ${primerNombre}` : ''} 👋
            </h1>
            <p className="muted greeting-sub">Elige una empresa para continuar.</p>

            {error && <div className="error">{error}</div>}

            <div className="org-grid">
              {me.memberships.map((m) => (
                <Link key={m.membershipId} href={`/orgs/${m.organization.id}`} className="org-card">
                  {m.organization.logoUrl ? (
                    <span className="org-initial" style={{ overflow: 'hidden', padding: 0 }}>
                      <img
                        src={m.organization.logoUrl}
                        alt={m.organization.nombre}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </span>
                  ) : (
                    <span className="org-initial">
                      {m.organization.nombre.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <strong>{m.organization.nombre}</strong>
                  <span className="badge">{m.rol}</span>
                </Link>
              ))}

              {creating ? (
                <form className="org-card org-card-form" onSubmit={createOrg}>
                  <label>Nombre de la empresa</label>
                  <input value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus />
                  <label>RNC (opcional)</label>
                  <input value={rnc} onChange={(e) => setRnc(e.target.value)} />
                  <button style={{ marginTop: 10 }}>Crear</button>
                </form>
              ) : (
                <button className="org-card org-card-new" onClick={() => setCreating(true)}>
                  <span className="org-initial org-initial-ghost">+</span>
                  <strong>Crear empresa contable</strong>
                  <span className="muted">Añade un despacho nuevo</span>
                </button>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}
