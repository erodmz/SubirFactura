'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, clearTokens, getTokens } from '../../../lib/api';
import ThemeToggle from '../../../components/ThemeToggle';

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const [orgName, setOrgName] = useState('');

  useEffect(() => {
    if (!getTokens()) {
      router.replace('/login');
      return;
    }
    api<{ nombre: string }>(`/api/organizations/${orgId}`)
      .then((org) => setOrgName(org.nombre))
      .catch(() => {});
  }, [orgId, router]);

  function logout() {
    clearTokens();
    router.replace('/login');
  }

  return (
    <>
      <div className="topbar">
        <Link href="/app" className="brand">
          FacturaRD
        </Link>
        <nav>
          <Link href={`/orgs/${orgId}`}>Resumen</Link>
          <Link href={`/orgs/${orgId}/clients`}>Clientes</Link>
          <Link href={`/orgs/${orgId}/invoices`}>Facturas</Link>
          <Link href={`/orgs/${orgId}/dgii`}>606</Link>
          <Link href={`/orgs/${orgId}/members`}>Equipo</Link>
        </nav>
        <span className="muted">{orgName}</span>
        <ThemeToggle />
        <a onClick={logout} style={{ cursor: 'pointer' }}>
          Salir
        </a>
      </div>
      <main>{children}</main>
    </>
  );
}
