'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, apiUpload, apiUrl, clearTokens, getTokens } from '../../../lib/api';
import ThemeToggle from '../../../components/ThemeToggle';
import Logo from '../../../components/Logo';
import NotificationsBell from '../../../components/NotificationsBell';
import VerifyEmailBanner from '../../../components/VerifyEmailBanner';
import Tour from '../../../components/Tour';
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
  const [aprobacion, setAprobacion] = useState<{
    estado: 'pendiente' | 'aprobada' | 'rechazada';
    motivo: string | null;
    tieneDoc: boolean;
  } | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [subiendoDoc, setSubiendoDoc] = useState(false);
  const [errorDoc, setErrorDoc] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!getTokens()) {
      router.replace('/login');
      return;
    }
    api<{
      nombre: string;
      logoUrl: string | null;
      estadoAprobacion?: 'pendiente' | 'aprobada' | 'rechazada';
      motivoRechazo?: string | null;
      verificacionDocKey?: string | null;
    }>(`/api/organizations/${orgId}`)
      .then((org) => {
        setOrgName(org.nombre);
        setOrgLogo(org.logoUrl);
        setAprobacion({
          estado: org.estadoAprobacion ?? 'aprobada',
          motivo: org.motivoRechazo ?? null,
          tieneDoc: org.verificacionDocKey != null,
        });
      })
      .catch(() => {});
    api<Me>('/api/me').then(setMe).catch(() => {});
  }, [orgId, router]);

  async function subirVerificacion(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorDoc('');
    setSubiendoDoc(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await apiUpload(`/api/organizations/${orgId}/verificacion`, fd);
      setAprobacion((a) => (a ? { estado: 'pendiente', motivo: null, tieneDoc: true } : a));
    } catch (err) {
      setErrorDoc(err instanceof Error ? err.message : 'No se pudo subir el documento');
    } finally {
      setSubiendoDoc(false);
      e.target.value = '';
    }
  }

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

  // El dueño de negocio (rol cliente) no tiene "Resumen": esa pantalla es del
  // contador y le respondía "no tienes permiso". Si aterriza en la raíz de la
  // empresa (un enlace viejo, o al elegirla en /app), lo llevamos a su espacio.
  useEffect(() => {
    if (!me) return;
    const suRol = me.memberships.find((m) => m.organization.id === orgId)?.rol;
    if (suRol === 'cliente' && pathname === `/orgs/${orgId}`) {
      router.replace(`/orgs/${orgId}/mi-negocio`);
    }
  }, [me, pathname, orgId, router]);

  function logout() {
    clearTokens();
    router.replace('/');
  }

  const base = `/orgs/${orgId}`;
  const rol = me?.memberships.find((m) => m.organization.id === orgId)?.rol;
  const navItems = rol === 'cliente' ? NAV_CLIENTE : NAV;

  // KYC: mientras la empresa no esté aprobada, el panel completo queda cerrado
  // — solo estado + subir documento (el guard del API bloquea el resto igual).
  if (aprobacion && aprobacion.estado !== 'aprobada') {
    return (
      <main className="auth-box" style={{ maxWidth: 560 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '2.6rem' }} aria-hidden>
            {aprobacion.estado === 'rechazada' ? '🙁' : '🕵️'}
          </span>
          <h1>
            {aprobacion.estado === 'rechazada'
              ? 'La verificación fue rechazada'
              : `${orgName || 'Tu empresa'} está en revisión`}
          </h1>
          {aprobacion.estado === 'rechazada' && aprobacion.motivo && (
            <div className="error" style={{ textAlign: 'left' }}>
              Motivo: {aprobacion.motivo}
            </div>
          )}
          <p className="muted">
            {aprobacion.estado === 'rechazada'
              ? 'Corrige el documento y súbelo de nuevo — lo revisamos en cuanto llegue.'
              : aprobacion.tieneDoc
                ? 'Recibimos tu documento y lo estamos revisando (normalmente el mismo día). Te avisamos en cuanto quede activa.'
                : 'Falta el documento que pruebe que eres el dueño o tienes acceso a la empresa (una factura del negocio, registro mercantil o certificado del RNC).'}
          </p>
          {errorDoc && <div className="error">{errorDoc}</div>}
          {rol === 'org_admin' && (
            <label
              className="card"
              style={{ display: 'block', cursor: 'pointer', borderStyle: 'dashed', marginTop: 10 }}
            >
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                onChange={subirVerificacion}
                disabled={subiendoDoc}
                style={{ display: 'none' }}
              />
              {subiendoDoc
                ? 'Subiendo…'
                : aprobacion.tieneDoc
                  ? '📎 Reemplazar el documento (PDF o foto, hasta 5 MB)'
                  : '📎 Subir el documento (PDF o foto, hasta 5 MB)'}
            </label>
          )}
          <p style={{ marginTop: 14 }}>
            <Link href="/app">← Volver a mis empresas</Link>
          </p>
        </div>
      </main>
    );
  }

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
                data-tour={`nav-${item.key.replace('/', '') || 'resumen'}`}
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
                <Link href={`${pathname}?tour=1`} className="user-dropdown-item">
                  Ver guía de inicio
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
          {/* Mientras el cliente se redirige fuera del "Resumen", no pintamos el
              dashboard del contador (daría un parpadeo de "no tienes permiso"). */}
          {rol === 'cliente' && pathname === base ? null : children}
        </main>
        {rol && (
          <Suspense fallback={null}>
            <Tour rol={rol} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
