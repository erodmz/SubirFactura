'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, clearTokens, getTokens } from '../lib/api';
import type { Me } from '../lib/types';

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

  if (!me) return <main className="muted">Cargando…</main>;

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Mis empresas</h1>
        <div>
          {me.isSuperAdmin && (
            <Link href="/admin" style={{ marginRight: 16 }}>
              Panel super-admin
            </Link>
          )}
          <button className="secondary" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </div>

      {me.memberships.length === 0 && (
        <p className="muted">Aún no perteneces a ninguna empresa. Crea la tuya:</p>
      )}

      {me.memberships.map((m) => (
        <Link key={m.membershipId} href={`/orgs/${m.organization.id}`}>
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>{m.organization.nombre}</strong>
            <span className="badge">{m.rol}</span>
          </div>
        </Link>
      ))}

      <div className="card">
        <h2>{creating ? 'Nueva empresa contable' : ''}</h2>
        {!creating ? (
          <button className="secondary" style={{ marginTop: 0 }} onClick={() => setCreating(true)}>
            + Crear empresa contable
          </button>
        ) : (
          <form onSubmit={createOrg}>
            {error && <div className="error">{error}</div>}
            <label>Nombre de la empresa</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            <label>RNC (opcional)</label>
            <input value={rnc} onChange={(e) => setRnc(e.target.value)} />
            <button>Crear</button>
          </form>
        )}
      </div>
    </main>
  );
}
