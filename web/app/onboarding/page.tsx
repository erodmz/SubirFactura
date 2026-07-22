'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, apiUpload, getTokens } from '../../lib/api';
import Logo from '../../components/Logo';
import ThemeToggle from '../../components/ThemeToggle';
import type { PlanInfo } from '../../lib/types';

/**
 * Onboarding del despacho: 3 pasos cortos y amables — nombre, plan, ¡listo!
 * Los planes (límites y precios) vienen de la BD, nunca hardcodeados.
 */

const PASOS = ['Tu despacho', 'Tu plan', 'Verificación', '¡Listo!'];

const fmtRD = (n: number) =>
  n === 0 ? 'Gratis' : `RD$${n.toLocaleString('es-DO')}/mes`;

export default function OnboardingPage() {
  const router = useRouter();
  const [paso, setPaso] = useState(0);
  const [nombre, setNombre] = useState('');
  const [rnc, setRnc] = useState('');
  const [planes, setPlanes] = useState<PlanInfo[]>([]);
  const [plan, setPlan] = useState('Básico');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [orgId, setOrgId] = useState('');
  const [docSubido, setDocSubido] = useState(false);

  useEffect(() => {
    if (!getTokens()) {
      router.replace('/login');
      return;
    }
    // El super-admin no monta "su" despacho: crea empresas PARA otros (con
    // plan e invitación de admin) desde el panel de plataforma.
    api<{ isSuperAdmin?: boolean }>('/api/me')
      .then((me) => {
        if (me.isSuperAdmin) router.replace('/admin?crear=1');
      })
      .catch(() => {});
    api<PlanInfo[]>('/api/plans').then(setPlanes).catch(() => {});
  }, [router]);

  const planElegido = useMemo(() => planes.find((p) => p.nombre === plan), [planes, plan]);

  function next(e?: React.FormEvent) {
    e?.preventDefault();
    setError('');
    if (paso === 0 && !nombre.trim()) {
      setError('Ponle nombre a tu despacho — puedes cambiarlo después');
      return;
    }
    setPaso((p) => p + 1);
  }

  async function crear() {
    setError('');
    setBusy(true);
    try {
      const org = await api<{ id: string }>('/api/organizations', {
        method: 'POST',
        body: { nombre: nombre.trim(), rnc: rnc.trim() || undefined, planNombre: plan },
      });
      setOrgId(org.id);
      setPaso(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setBusy(false);
    }
  }

  async function subirDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await apiUpload(`/api/organizations/${orgId}/verificacion`, fd);
      setDocSubido(true);
      setPaso(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el documento');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  return (
    <>
      <style>{`
        .ob-progress { display:flex; gap:8px; margin:18px 0 26px; }
        .ob-progress .seg { flex:1; text-align:center; font-size:.85rem; opacity:.5; }
        .ob-progress .seg .bar { height:4px; border-radius:2px; background: currentColor; opacity:.25; margin-bottom:6px; }
        .ob-progress .seg.done { opacity:1; }
        .ob-progress .seg.done .bar { opacity:1; background: var(--accent, #6c7cff); }
        .ob-plans { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; margin:14px 0; }
        /* Son <button>: anular el blanco-sobre-brand del botón global, que en
           tema claro dejaba el texto invisible. */
        .ob-plan { text-align:left; border:2px solid var(--border); border-radius:12px; padding:14px;
                   cursor:pointer; background: var(--bg-soft); color: var(--text);
                   transition: border-color .15s, transform .15s, box-shadow .15s; }
        .ob-plan:hover { transform: translateY(-2px); background: var(--bg-soft); box-shadow: 0 6px 18px rgba(0,0,0,.08); }
        .ob-plan.sel { border-color: var(--brand); box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 22%, transparent); }
        .ob-plan .precio { font-size:1.15rem; font-weight:700; margin:.35rem 0; color: var(--brand); }
        .ob-plan ul { color: var(--muted); }
        .ob-plan ul { margin:.4rem 0 0; padding-left:1.1rem; font-size:.85rem; }
        .ob-plan ul li { margin:.15rem 0; }
        @keyframes ob-pop { 0% { transform: scale(.6); opacity:0 } 100% { transform: scale(1); opacity:1 } }
        .ob-party { font-size:3.2rem; animation: ob-pop .5s ease-out; display:inline-block; }
        @keyframes ob-fall { to { transform: translateY(110vh) rotate(720deg); opacity:.9 } }
        .ob-confetti { position:fixed; inset:0; pointer-events:none; overflow:hidden; }
        .ob-confetti i { position:absolute; top:-4vh; width:9px; height:14px; border-radius:2px;
                         animation: ob-fall 2.8s linear forwards; }
        .ob-next li { margin:.45rem 0; }
      `}</style>

      <div className="topbar">
        <Link href="/" aria-label="Inicio">
          <Logo />
        </Link>
        <div style={{ flex: 1 }} />
        <ThemeToggle />
      </div>

      <main className="auth-box" style={{ maxWidth: 640 }}>
        <div className="ob-progress" aria-hidden>
          {PASOS.map((titulo, i) => (
            <div key={titulo} className={`seg${i <= paso ? ' done' : ''}`}>
              <div className="bar" />
              {titulo}
            </div>
          ))}
        </div>

        {error && <div className="error">{error}</div>}

        {paso === 0 && (
          <div className="card">
            <h1>Vamos a montar tu despacho 🏗️</h1>
            <p className="muted">
              Dos preguntas y ya. En serio, dos.
            </p>
            <form onSubmit={next}>
              <label>¿Cómo se llama tu despacho o empresa contable?</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Contadores Brillantes SRL"
                autoFocus
                required
              />
              <label>RNC del despacho (opcional — se puede agregar después)</label>
              <input value={rnc} onChange={(e) => setRnc(e.target.value)} placeholder="1-31-00000-0" />
              <button style={{ marginTop: 14 }}>Continuar →</button>
            </form>
          </div>
        )}

        {paso === 1 && (
          <div className="card">
            <h1>Elige tu plan ✨</h1>
            <p className="muted">
              Empieza donde te quede cómodo — lo cambias cuando quieras en Configuración.
            </p>
            <div className="ob-plans">
              {planes.map((p) => {
                const precio = Number(p.precio);
                return (
                  <button
                    key={p.nombre}
                    type="button"
                    className={`ob-plan${plan === p.nombre ? ' sel' : ''}`}
                    onClick={() => setPlan(p.nombre)}
                    aria-pressed={plan === p.nombre}
                  >
                    <strong>{p.nombre}</strong>
                    {precio === 0 && <span className="badge" style={{ marginLeft: 8 }}>para empezar</span>}
                    <div className="precio">{fmtRD(precio)}</div>
                    <ul>
                      <li>{p.maxContadores} {p.maxContadores === 1 ? 'contador' : 'contadores'}</li>
                      <li>Hasta {p.maxClientes} clientes</li>
                      <li>{p.maxFacturasMes.toLocaleString('es-DO')} facturas/mes</li>
                    </ul>
                  </button>
                );
              })}
            </div>
            {planElegido && Number(planElegido.precio) > 0 && (
              <p className="muted" style={{ fontSize: '.85rem' }}>
                Los planes pagos se activan al instante y coordinamos el pago contigo por
                transferencia — sin tarjeta, sin sorpresas.
              </p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="secondary" onClick={() => setPaso(0)}>
                ← Atrás
              </button>
              <button type="button" onClick={crear} disabled={busy || planes.length === 0}>
                {busy ? 'Creando tu despacho…' : `Crear "${nombre.trim() || 'mi despacho'}"`}
              </button>
            </div>
          </div>
        )}

        {paso === 2 && (
          <div className="card">
            <h1>Un último paso: verifiquemos que es tuya 🛡️</h1>
            <p className="muted">
              Manejamos información fiscal, así que antes de activar{' '}
              <strong>{nombre.trim()}</strong> necesitamos una prueba de que eres el dueño o
              tienes acceso a la empresa. Sirve cualquiera de estos:
            </p>
            <ul className="ob-next">
              <li>🧾 Una factura emitida o recibida por la empresa</li>
              <li>📜 El registro mercantil o certificado del RNC</li>
              <li>📄 Cualquier documento oficial a nombre de la empresa</li>
            </ul>
            <label
              className="card"
              style={{ display: 'block', textAlign: 'center', cursor: 'pointer', borderStyle: 'dashed' }}
            >
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                onChange={subirDoc}
                disabled={busy}
                style={{ display: 'none' }}
              />
              {busy ? 'Subiendo…' : '📎 Toca aquí para subir el documento (PDF o foto, hasta 5 MB)'}
            </label>
            <p className="muted" style={{ fontSize: '.85rem' }}>
              Nuestro equipo lo revisa (normalmente el mismo día) y te activamos la empresa.
            </p>
            <button type="button" className="link-btn" onClick={() => setPaso(3)}>
              Lo subo después →
            </button>
          </div>
        )}

        {paso === 3 && (
          <div className="card" style={{ textAlign: 'center' }}>
            <Confetti />
            <span className="ob-party" aria-hidden>🕵️</span>
            <h1>¡{nombre.trim()} quedó registrada!</h1>
            <p className="muted">
              {docSubido
                ? 'Recibimos tu documento. Estamos revisándolo — normalmente el mismo día — y te activamos la empresa.'
                : 'Está pendiente de verificación: sube el documento desde tu panel para que podamos activarla.'}
            </p>
            <ul className="ob-next" style={{ textAlign: 'left', display: 'inline-block' }}>
              <li>✅ Plan {plan} reservado para tu empresa</li>
              <li>🕐 Te avisamos en cuanto quede aprobada</li>
              <li>🚀 Después: clientes, invitaciones y facturas con IA</li>
            </ul>
            <div>
              <button onClick={() => router.push(`/orgs/${orgId}`)} style={{ marginTop: 10 }}>
                Ver el estado de mi empresa →
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

/** Confeti sin dependencias: 40 piezas CSS que caen una sola vez. */
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        delay: `${((i * 13) % 20) / 10}s`,
        color: ['#6c7cff', '#a78bfa', '#34d399', '#fbbf24', '#f87171'][i % 5],
      })),
    [],
  );
  return (
    <div className="ob-confetti" aria-hidden>
      {pieces.map((p, i) => (
        <i key={i} style={{ left: p.left, animationDelay: p.delay, background: p.color }} />
      ))}
    </div>
  );
}
