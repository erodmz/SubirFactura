'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getTokens } from '../lib/api';
import ThemeToggle from '../components/ThemeToggle';

const FEATURES = [
  {
    color: 'var(--m-blue)',
    icon: '📸',
    title: 'Captura desde el móvil',
    text: 'Tus clientes fotografían sus facturas. La cola offline-first las sube sola al recuperar señal.',
  },
  {
    color: 'var(--m-purple)',
    icon: '🤖',
    title: 'Lectura con IA',
    text: 'Claude extrae NCF, RNC, fecha, montos e ITBIS con confianza por campo. Lo dudoso va a revisión.',
  },
  {
    color: 'var(--m-green)',
    icon: '📄',
    title: 'Reportes 606 / 607',
    text: 'Genera el TXT oficial de la DGII y el Excel del período en un clic, con validación del padrón RNC.',
  },
  {
    color: 'var(--m-orange)',
    icon: '🏢',
    title: 'Multi-empresa',
    text: 'Un despacho, varios contadores y clientes. Cada quien ve solo lo suyo, con datos aislados por tenant.',
  },
];

// Mockup tipo tablero de Monday: facturas con chips de estado de colores.
const BOARD = [
  { cliente: 'Colmado Don José', ncf: 'B0100000123', estado: 'Validada', color: 'var(--m-green)' },
  { cliente: 'Ferretería Popular', ncf: 'B0200004511', estado: 'En revisión', color: 'var(--m-orange)' },
  { cliente: 'CEIDI', ncf: 'B0100008820', estado: 'En 606', color: 'var(--m-blue)' },
  { cliente: 'Farmacia Carol', ncf: 'E310000000071', estado: 'Procesando', color: 'var(--m-purple)' },
];

export default function Landing() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => setAuthed(!!getTokens()), []);

  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="brand">FacturaRD</span>
        <div className="landing-nav-actions">
          <ThemeToggle />
          {authed ? (
            <Link className="btn btn-primary" href="/app">
              Ir al panel
            </Link>
          ) : (
            <>
              <Link className="btn btn-ghost" href="/login">
                Iniciar sesión
              </Link>
              <Link className="btn btn-primary" href="/register">
                Comenzar gratis
              </Link>
            </>
          )}
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="pill">Para contadores de República Dominicana 🇩🇴</span>
          <h1>
            Los gastos de tus clientes,{' '}
            <span className="hl-blue">capturados</span>,{' '}
            <span className="hl-purple">leídos por IA</span> y{' '}
            <span className="hl-green">listos para la DGII</span>.
          </h1>
          <p className="hero-sub">
            Deja de perseguir facturas físicas. FacturaRD recolecta, digitaliza y reporta el 606/607
            por ti — desde la foto hasta el TXT oficial.
          </p>
          <div className="hero-cta">
            <Link className="btn btn-primary btn-lg" href={authed ? '/app' : '/login'}>
              Entrar a la app →
            </Link>
            <Link className="btn btn-ghost btn-lg" href="/register">
              Crear cuenta
            </Link>
          </div>
          <p className="hero-note">Sin tarjeta. Activación inmediata.</p>
        </div>

        <div className="hero-visual" aria-hidden>
          <div className="board">
            <div className="board-head">
              <span className="board-dot" style={{ background: 'var(--m-red)' }} />
              <span className="board-dot" style={{ background: 'var(--m-orange)' }} />
              <span className="board-dot" style={{ background: 'var(--m-green)' }} />
              <span className="board-title">Facturas · Mayo 2026</span>
            </div>
            <div className="board-row board-row-head">
              <span>Cliente</span>
              <span>NCF</span>
              <span>Estado</span>
            </div>
            {BOARD.map((r) => (
              <div className="board-row" key={r.ncf}>
                <span className="board-client">{r.cliente}</span>
                <span className="board-ncf">{r.ncf}</span>
                <span className="status-chip" style={{ background: r.color }}>
                  {r.estado}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="features">
        {FEATURES.map((f) => (
          <div className="feature-card" key={f.title}>
            <span className="feature-icon" style={{ background: f.color }}>
              {f.icon}
            </span>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </div>
        ))}
      </section>

      <section className="cta-strip">
        <h2>Tu próximo cierre del 606, sin estrés.</h2>
        <Link className="btn btn-primary btn-lg" href={authed ? '/app' : '/login'}>
          Iniciar sesión
        </Link>
      </section>

      <footer className="landing-footer">
        <span>FacturaRD · Digitalización de facturas y reportes DGII</span>
      </footer>
    </div>
  );
}
