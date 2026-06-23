'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, getTokens, saveTokens, type Tokens } from '../../lib/api';
import { getThemePref, setThemePref, type ThemePref } from '../../lib/theme';
import Logo from '../../components/Logo';
import type { Me } from '../../lib/types';

const THEME_OPTIONS: { value: ThemePref; label: string; icon: string }[] = [
  { value: 'light', label: 'Claro', icon: '☀️' },
  { value: 'dark', label: 'Oscuro', icon: '🌙' },
  { value: 'system', label: 'Sistema', icon: '🖥️' },
];

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [theme, setTheme] = useState<ThemePref>('system');

  // Cambio de contraseña
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwOk, setPwOk] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!getTokens()) {
      router.replace('/login');
      return;
    }
    setTheme(getThemePref());
    api<Me>('/api/me').then(setMe).catch(() => {});
  }, [router]);

  function chooseTheme(pref: ThemePref) {
    setTheme(pref);
    setThemePref(pref);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError('');
    setPwOk(false);
    if (next.length < 8) {
      setPwError('La nueva contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (next !== confirm) {
      setPwError('La confirmación no coincide');
      return;
    }
    setSaving(true);
    try {
      const tokens = await api<Tokens>('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword: current, newPassword: next },
      });
      saveTokens(tokens);
      setPwOk(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <Link href="/" aria-label="Inicio">
          <Logo />
        </Link>
        <div style={{ flex: 1 }} />
        <Link href="/app">← Volver</Link>
      </div>
      <main>
        <h1>Mi cuenta</h1>

        <div className="card">
          <h2>Datos del usuario</h2>
          <label>Nombre</label>
          <input value={me?.nombre ?? ''} disabled />
          <label>Correo</label>
          <input value={me?.email ?? ''} disabled />
          <p className="muted" style={{ marginTop: 8 }}>
            Para cambiar tu nombre o correo, contacta a tu administrador.
          </p>
        </div>

        <div className="card">
          <h2>Apariencia</h2>
          <label>Tema</label>
          <div className="seg">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={theme === opt.value ? 'seg-item active' : 'seg-item'}
                onClick={() => chooseTheme(opt.value)}
              >
                <span aria-hidden>{opt.icon}</span> {opt.label}
              </button>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            «Sistema» usa el tema claro u oscuro de tu dispositivo.
          </p>
        </div>

        <div className="card">
          <h2>Cambiar contraseña</h2>
          {pwError && <div className="error">{pwError}</div>}
          {pwOk && <div className="notice">Contraseña actualizada correctamente.</div>}
          <form onSubmit={changePassword}>
            <label>Contraseña actual</label>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
            <label>Nueva contraseña</label>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              required
            />
            <label>Confirmar nueva contraseña</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
            <button disabled={saving}>{saving ? 'Guardando…' : 'Cambiar contraseña'}</button>
          </form>
        </div>
      </main>
    </>
  );
}
