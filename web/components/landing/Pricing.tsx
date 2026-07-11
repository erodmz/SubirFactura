'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Plan {
  nombre: string;
  gancho: string;
  precioMes: number; // RD$/mes (0 = gratis)
  destacado?: boolean;
  cta: string;
  ctaHref: string;
  limites: string[];
}

const PLANES: Plan[] = [
  {
    nombre: 'Gratis',
    gancho: 'Para empezar hoy mismo',
    precioMes: 0,
    cta: 'Comenzar gratis',
    ctaHref: '/register',
    limites: ['1 contador', 'Hasta 10 clientes', '200 facturas al mes', 'Reporte 606 oficial'],
  },
  {
    nombre: 'Pro',
    gancho: 'Para el despacho que crece',
    precioMes: 1995,
    destacado: true,
    cta: 'Elegir Pro',
    ctaHref: '/register',
    limites: [
      '5 contadores',
      'Hasta 50 clientes',
      '1,500 facturas al mes',
      'Verificación DGII en vivo',
      'Todo lo del plan Gratis',
    ],
  },
  {
    nombre: 'Empresarial',
    gancho: 'Para firmas con volumen',
    precioMes: 4995,
    cta: 'Elegir Empresarial',
    ctaHref: '/register',
    limites: [
      '25 contadores',
      'Hasta 300 clientes',
      '10,000 facturas al mes',
      'Soporte prioritario',
      'Todo lo del plan Pro',
    ],
  },
];

const fmt = (n: number) => n.toLocaleString('es-DO');

export default function Pricing() {
  const [anual, setAnual] = useState(false);

  return (
    <div className="pricing-wrap">
      <div className="pricing-toggle" role="group" aria-label="Ciclo de facturación">
        <button
          type="button"
          className={!anual ? 'active' : ''}
          onClick={() => setAnual(false)}
          aria-pressed={!anual}
        >
          Mensual
        </button>
        <button
          type="button"
          className={anual ? 'active' : ''}
          onClick={() => setAnual(true)}
          aria-pressed={anual}
        >
          Anual <span className="save-badge">2 meses gratis</span>
        </button>
      </div>

      <div className="pricing-grid">
        {PLANES.map((p) => {
          const gratis = p.precioMes === 0;
          // Anual = paga 10 meses (2 gratis). Mostramos el equivalente por mes.
          const precioMostrado = anual ? Math.round((p.precioMes * 10) / 12) : p.precioMes;
          return (
            <div key={p.nombre} className={`price-card${p.destacado ? ' featured' : ''}`}>
              {p.destacado && <span className="price-tag">★ Más popular</span>}
              <h3 className="price-name">{p.nombre}</h3>
              <p className="price-hook">{p.gancho}</p>
              <div className="price-amount">
                {gratis ? (
                  <span className="price-free">RD$0</span>
                ) : (
                  <>
                    <span className="price-currency">RD$</span>
                    <span className="price-value">{fmt(precioMostrado)}</span>
                    <span className="price-period">/mes</span>
                  </>
                )}
              </div>
              <p className="price-sub">
                {gratis
                  ? 'Sin tarjeta. Para siempre.'
                  : anual
                    ? `RD$${fmt(p.precioMes * 10)} al año · ahorras RD$${fmt(p.precioMes * 2)}`
                    : 'Facturado cada mes. Cancela cuando quieras.'}
              </p>
              <Link className={`btn btn-lg ${p.destacado ? 'btn-primary' : 'btn-outline'}`} href={p.ctaHref}>
                {p.cta}
              </Link>
              <ul className="price-list">
                {p.limites.map((l) => (
                  <li key={l}>
                    <span className="check" aria-hidden>
                      ✓
                    </span>
                    {l}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="pricing-foot">
        Precios en pesos dominicanos (RD$). Sin contratos ni permanencia — cancela cuando quieras.
      </p>
    </div>
  );
}
