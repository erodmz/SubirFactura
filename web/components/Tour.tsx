'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Tour de bienvenida por perfil (sin dependencias): oscurece la pantalla y va
 * iluminando los elementos marcados con data-tour, con pasos distintos según
 * el rol. Se muestra una sola vez por rol (localStorage) y puede relanzarse
 * con ?tour=1 (enlace "Ver guía de inicio" del menú de usuario).
 */

export interface TourStep {
  /** Valor del atributo data-tour del elemento a iluminar; sin target = centrado. */
  target?: string;
  titulo: string;
  cuerpo: string;
}

const PASOS_ORG_ADMIN: TourStep[] = [
  {
    titulo: '¡Bienvenido a tu despacho! 👋',
    cuerpo:
      'Este es tu centro de mando. Te enseñamos lo esencial en 30 segundos — puedes saltarlo cuando quieras.',
  },
  {
    target: 'nav-clients',
    titulo: 'Clientes',
    cuerpo:
      'Cada negocio al que le llevas los gastos vive aquí, con su propio RNC. El 606 se genera POR cliente — así lo exige la DGII.',
  },
  {
    target: 'nav-members',
    titulo: 'Equipo',
    cuerpo:
      'Invita a tus contadores y a tus clientes con un enlace (WhatsApp funciona de maravilla). Tú decides quién ve qué.',
  },
  {
    target: 'nav-invoices',
    titulo: 'Facturas',
    cuerpo:
      'Todo lo que tus clientes fotografían cae aquí. La IA lee NCF, RNC e ITBIS; tú solo revisas lo dudoso.',
  },
  {
    target: 'nav-dgii',
    titulo: 'El 606',
    cuerpo: 'Cierras el período y descargas el TXT oficial listo para la DGII. Sin Excel a medianoche.',
  },
  {
    target: 'nav-settings',
    titulo: 'Configuración',
    cuerpo: 'Tu plan, tu consumo, tu logo. Puedes subir o bajar de plan cuando quieras.',
  },
];

const PASOS_CONTADOR: TourStep[] = [
  {
    titulo: '¡Hola! Esta es tu mesa de trabajo 👋',
    cuerpo: 'En 20 segundos te mostramos dónde está todo.',
  },
  {
    target: 'nav-invoices',
    titulo: 'Facturas',
    cuerpo:
      'Las facturas de TUS clientes asignados llegan aquí. La IA extrae los datos; tú validas las que queden en revisión.',
  },
  {
    target: 'nav-clients',
    titulo: 'Clientes',
    cuerpo: 'Los negocios que atiendes. Solo ves los que te asignó el administrador.',
  },
  {
    target: 'nav-dgii',
    titulo: 'El 606',
    cuerpo: 'Cuando el mes cuadra, aquí se cierra el período y sale el TXT oficial.',
  },
];

const PASOS_CLIENTE: TourStep[] = [
  {
    titulo: '¡Bienvenido! Esto es muy fácil 👋',
    cuerpo:
      'Tu única misión: cada factura de gasto que te den, la fotografías y la subes. Tu contador se encarga del resto.',
  },
  {
    target: 'nav-mi-negocio',
    titulo: 'Mis facturas',
    cuerpo:
      'Aquí subes las fotos y ves lo que ya enviaste. Consejo: súbelas el mismo día y el cierre de mes será un paseo.',
  },
];

const PASOS: Record<string, TourStep[]> = {
  org_admin: PASOS_ORG_ADMIN,
  contador: PASOS_CONTADOR,
  cliente: PASOS_CLIENTE,
};

const storageKey = (rol: string) => `sf-tour-v1-${rol}`;

export default function Tour({ rol }: { rol: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [idx, setIdx] = useState(-1); // -1 = apagado
  const [rect, setRect] = useState<DOMRect | null>(null);

  const pasos = useMemo(() => PASOS[rol] ?? [], [rol]);
  const paso = idx >= 0 ? pasos[idx] : undefined;

  // Arranque: primera visita con este rol, o relanzado con ?tour=1.
  useEffect(() => {
    if (pasos.length === 0) return;
    const forced = searchParams.get('tour') === '1';
    let seen = false;
    try {
      seen = localStorage.getItem(storageKey(rol)) === 'done';
    } catch {
      /* sin storage: mejor no insistir en cada carga */
      seen = true;
    }
    if (forced || !seen) setIdx(0);
  }, [pasos, rol, searchParams]);

  // Medir el elemento objetivo (y re-medir si cambia el tamaño de la ventana).
  const measure = useCallback(() => {
    if (!paso?.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(`[data-tour="${paso.target}"]`);
    const r = el?.getBoundingClientRect();
    // Elemento oculto o fuera de pantalla (ej. sidebar plegada/off-canvas en
    // móvil) → paso centrado con overlay completo.
    const visible =
      r &&
      r.width > 0 &&
      r.right > 0 &&
      r.bottom > 0 &&
      r.left < window.innerWidth &&
      r.top < window.innerHeight;
    setRect(visible ? r : null);
  }, [paso]);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const finish = useCallback(() => {
    setIdx(-1);
    try {
      localStorage.setItem(storageKey(rol), 'done');
    } catch {
      /* ignore */
    }
    // Limpia ?tour=1 para que un refresh no lo relance.
    if (searchParams.get('tour')) router.replace(pathname);
  }, [rol, router, pathname, searchParams]);

  useEffect(() => {
    if (idx < 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [idx, finish]);

  if (!paso) return null;

  const last = idx === pasos.length - 1;
  const pad = 6;
  const spotlight = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  // Tooltip: a la derecha del elemento si cabe; si no, debajo; sin target, centrado.
  const tipStyle: React.CSSProperties = spotlight
    ? spotlight.left + spotlight.width + 340 < window.innerWidth
      ? { top: Math.max(16, spotlight.top), left: spotlight.left + spotlight.width + 14 }
      : {
          top: Math.min(spotlight.top + spotlight.height + 14, window.innerHeight - 220),
          left: Math.min(Math.max(16, spotlight.left), window.innerWidth - 336),
        }
    : { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Guía: ${paso.titulo}`}>
      {spotlight ? (
        <div
          style={{
            position: 'fixed',
            zIndex: 200,
            borderRadius: 10,
            boxShadow: '0 0 0 9999px rgba(0,0,0,.6)',
            pointerEvents: 'none',
            transition: 'all .25s ease',
            ...spotlight,
          }}
        />
      ) : (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.6)' }}
          onClick={finish}
        />
      )}
      <div
        className="card"
        style={{ position: 'fixed', zIndex: 201, width: 320, margin: 0, ...tipStyle }}
      >
        <strong>{paso.titulo}</strong>
        <p style={{ margin: '8px 0 12px', fontSize: '.92rem' }}>{paso.cuerpo}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="muted" style={{ fontSize: '.8rem' }}>
            {idx + 1} / {pasos.length}
          </span>
          <div style={{ flex: 1 }} />
          <button type="button" className="link-btn" onClick={finish}>
            Saltar
          </button>
          {idx > 0 && (
            <button type="button" className="secondary" onClick={() => setIdx(idx - 1)}>
              ←
            </button>
          )}
          <button type="button" onClick={() => (last ? finish() : setIdx(idx + 1))}>
            {last ? '¡A trabajar!' : 'Siguiente →'}
          </button>
        </div>
      </div>
    </div>
  );
}
