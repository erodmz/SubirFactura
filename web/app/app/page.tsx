'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, clearTokens, getTokens } from '../../lib/api';
import ThemeToggle from '../../components/ThemeToggle';
import type { Me } from '../../lib/types';

/** Selector de empresa: un usuario puede pertenecer a varias con roles distintos (§4). */
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
    router.replace('/login');
  }

  return (
    <>
      <div className="topbar">
        <Link href="/" className="brand">
          FacturaRD
        </Link>
        <div style={{ flex: 1 }} />
        {me?.isSuperAdmin && <Link href="/admin">Panel super-admin</Link>}
        <ThemeToggle />
        <a onClick={logout} style={{ cursor: 'pointer' }}>
          Salir
        </a>
      </div>
      <main>
        {!me ? (
          <p className="muted">Cargando…</p>
        ) : (
          <>
            <h1>Mis empresas</h1>
            {me.memberships.length === 0 && (
              <p className="muted">Aún no perteneces a ninguna empresa. Crea la tuya:</p>
            )}

            <div className="org-grid">
              {me.memberships.map((m) => (
                <Link key={m.membershipId} href={`/orgs/${m.organization.id}`} className="org-card">
                  <span className="org-initial">{m.organization.nombre.charAt(0).toUpperCase()}</span>
                  <strong>{m.organization.nombre}</strong>
                  <span className="badge">{m.rol}</span>
                </Link>
              ))}
            </div>

            <div className="card" style={{ marginTop: 16 }}>
              {!creating ? (
                <button
                  className="secondary"
                  style={{ marginTop: 0 }}
                  onClick={() => setCreating(true)}
                >
                  + Crear empresa contable
                </button>
              ) : (
                <form onSubmit={createOrg}>
                  <h2>Nueva empresa contable</h2>
                  {error && <div className="error">{error}</div>}
                  <label>Nombre de la empresa</label>
                  <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
                  <label>RNC (opcional)</label>
                  <input value={rnc} onChange={(e) => setRnc(e.target.value)} />
                  <button>Crear</button>
                </form>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}
