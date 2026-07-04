'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, clearTokens, getTokens } from '../../../lib/api';
import ThemeToggle from '../../../components/ThemeToggle';
import Logo from '../../../components/Logo';
import type { Me } from '../../../lib/types';

const NAV = [
  { key: '', label: 'Resumen', icon: '📊' },
  { key: '/invoices', label: 'Facturas', icon: '📄' },
  { key: '/dgii', label: '606', icon: '🧾' },
  { key: '/clients', label: 'Clientes', icon: '👥' },
  { key: '/members', label: 'Equipo', icon: '🤝' },
  { key: '/settings', label: 'Configuración', icon: '⚙️' },
];

function initials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const { orgId } = useParams<{ orgId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const [orgName, setOrgName] = useState('');
  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!getTokens()) {
      router.replace('/login');
      return;
    }
    api<{ nombre: string }>(`/api/organizations/${orgId}`)
      .then((org) => setOrgName(org.nombre))
      .catch(() => {});
    api<Me>('/api/me').then(setMe).catch(() => {});
  }, [orgId, router]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function logout() {
    clearTokens();
    router.replace('/');
  }

  const base = `/orgs/${orgId}`;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Link href="/app" aria-label="Inicio">
            <Logo />
          </Link>
        </div>
        <nav className="side-nav">
          {NAV.map((item) => {
            const href = base + item.key;
            const active = item.key === '' ? pathname === base : pathname.startsWith(href);
            return (
              <Link key={item.key} href={href} className={active ? 'side-link active' : 'side-link'}>
                <span className="side-icon" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <ThemeToggle />
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <span className="org-name">{orgName || '…'}</span>
          <div style={{ flex: 1 }} />
          <div className="user-menu" ref={menuRef}>
            <button className="user-chip" onClick={() => setMenuOpen((v) => !v)}>
              <span className="avatar">{me ? initials(me.nombre, me.email) : '··'}</span>
              <span className="user-name">{me?.nombre ?? me?.email ?? ''}</span>
              <span className="chev" aria-hidden>
                ▾
              </span>
            </button>
            {menuOpen && me && (
              <div className="user-dropdown">
                <div className="user-dropdown-head">
                  <strong>{me.nombre ?? 'Usuario'}</strong>
                  <span className="muted">{me.email}</span>
                </div>
                <Link href="/app" className="user-dropdown-item">
                  Cambiar de empresa
                </Link>
                <Link href="/settings" className="user-dropdown-item">
                  Mi cuenta
                </Link>
                {me.isSuperAdmin && (
                  <Link href="/admin" className="user-dropdown-item">
                    Panel super-admin
                  </Link>
                )}
                <button className="user-dropdown-item danger-item" onClick={logout}>
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
