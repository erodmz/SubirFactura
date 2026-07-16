'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, apiUrl, clearTokens, getTokens } from '../../../lib/api';
import ThemeToggle from '../../../components/ThemeToggle';
import Logo from '../../../components/Logo';
import NotificationsBell from '../../../components/NotificationsBell';
import VerifyEmailBanner from '../../../components/VerifyEmailBanner';
import type { Me } from '../../../lib/types';

const NAV = [
  { key: '', label: 'Resumen', icon: '📊' },
  { key: '/invoices', label: 'Facturas', icon: '📄' },
  { key: '/dgii', label: '606', icon: '🧾' },
  { key: '/clients', label: 'Clientes', icon: '👥' },
  { key: '/members', label: 'Equipo', icon: '🤝' },
  { key: '/settings', label: 'Configuración', icon: '⚙️' },
];

// El cliente (dueño de negocio) solo ve SU espacio: el resto del panel es del
// contador y le respondía "no tienes permiso" (hallazgo F-04).
const NAV_CLIENTE = [{ key: '/mi-negocio', label: 'Mis facturas', icon: '📄' }];

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
  const [orgLogo, setOrgLogo] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!getTokens()) {
      router.replace('/login');
      return;
    }
    api<{ nombre: string; logoUrl: string | null }>(`/api/organizations/${orgId}`)
      .then((org) => {
        setOrgName(org.nombre);
        setOrgLogo(org.logoUrl);
      })
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

  // Cierra el drawer al navegar (móvil).
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  function logout() {
    clearTokens();
    router.replace('/');
  }

  const base = `/orgs/${orgId}`;
  const rol = me?.memberships.find((m) => m.organization.id === orgId)?.rol;
  const navItems = rol === 'cliente' ? NAV_CLIENTE : NAV;

  return (
    <div className="app-shell">
      {drawerOpen && (
        <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden />
      )}
      <aside className={drawerOpen ? 'sidebar open' : 'sidebar'}>
        <div className="sidebar-logo">
          <Link href="/app" aria-label="Cambiar de empresa" className="sidebar-org">
            {orgLogo ? (
              <span className="sidebar-org-logo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={apiUrl(orgLogo)} alt={orgName} />
              </span>
            ) : (
              <Logo />
            )}
            {orgName && <span className="sidebar-org-name">{orgName}</span>}
          </Link>
        </div>
        <nav className="side-nav">
          {navItems.map((item) => {
            const href = base + item.key;
            const active = item.key === '' ? pathname === base : pathname.startsWith(href);
            return (
              <Link
                key={item.key}
                href={href}
                className={active ? 'side-link active' : 'side-link'}
                onClick={() => setDrawerOpen(false)}
              >
                <span className="side-icon" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <button
            className="topbar-burger"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú"
          >
            ☰
          </button>
          <span className="org-name">{orgName || '…'}</span>
          <div style={{ flex: 1 }} />
          <NotificationsBell orgId={orgId} />
          <ThemeToggle />
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
        <main className="app-content">
          {me && me.emailVerified === false && <VerifyEmailBanner email={me.email} />}
          {children}
        </main>
      </div>
    </div>
  );
}
