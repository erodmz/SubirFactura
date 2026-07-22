'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, getTokens } from '../../lib/api';
import Logo from '../../components/Logo';
import ThemeToggle from '../../components/ThemeToggle';
import type { PlanInfo } from '../../lib/types';

/**
 * Onboarding del despacho: 3 pasos cortos y amables — nombre, plan, ¡listo!
 * Los planes (límites y precios) vienen de la BD, nunca hardcodeados.
 */

const PASOS = ['Tu despacho', 'Tu plan', '¡Listo!'];

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

  useEffect(() => {
    if (!getTokens()) {
      router.replace('/login');
      return;
    }
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

  return (
    <>
      <style>{`
        .ob-progress { display:flex; gap:8px; margin:18px 0 26px; }
        .ob-progress .seg { flex:1; text-align:center; font-size:.85rem; opacity:.5; }
        .ob-progress .seg .bar { height:4px; border-radius:2px; background: currentColor; opacity:.25; margin-bottom:6px; }
        .ob-progress .seg.done { opacity:1; }
        .ob-progress .seg.done .bar { opacity:1; background: var(--accent, #6c7cff); }
        .ob-plans { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; margin:14px 0; }
        .ob-plan { text-align:left; border:2px solid transparent; border-radius:12px; padding:14px; cursor:pointer;
                   background: rgba(127,127,127,.08); transition: border-color .15s, transform .15s; }
        .ob-plan:hover { transform: translateY(-2px); }
        .ob-plan.sel { border-color: var(--accent, #6c7cff); }
        .ob-plan .precio { font-size:1.15rem; font-weight:700; margin:.35rem 0; }
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
          <div className="card" style={{ textAlign: 'center' }}>
            <Confetti />
            <span className="ob-party" aria-hidden>🎉</span>
            <h1>¡{nombre.trim()} está en el aire!</h1>
            <p className="muted">
              Plan {plan} activo. Esto es lo que viene ahora (tranquilo, te guiamos adentro):
            </p>
            <ul className="ob-next" style={{ textAlign: 'left', display: 'inline-block' }}>
              <li>👥 Agrega tu primer cliente (su RNC y ya)</li>
              <li>📨 Invita a tus contadores o a tus clientes con un enlace</li>
              <li>📸 Que te manden la primera factura — la IA hace el resto</li>
            </ul>
            <div>
              <button onClick={() => router.push(`/orgs/${orgId}?tour=1`)} style={{ marginTop: 10 }}>
                Entrar a mi despacho →
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
