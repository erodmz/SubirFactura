import type { Metadata } from 'next';
import Link from 'next/link';
import Logo from '../components/Logo';
import ThemeToggle from '../components/ThemeToggle';
import AuthButtons from '../components/landing/AuthButtons';
import Pricing from '../components/landing/Pricing';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://subirfactura.do';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'SubirFactura — Digitaliza facturas y cierra tu 606 de la DGII sin estrés',
  description:
    'Software para contadores en República Dominicana. Tus clientes fotografían sus facturas de gastos, la IA lee NCF, RNC e ITBIS y generas el Formato 606 oficial de la DGII en un clic. Empieza gratis, sin tarjeta.',
  keywords: [
    'formato 606 DGII',
    '606 República Dominicana',
    'reporte 606',
    'formato 607',
    'digitalizar facturas de gastos',
    'software contable República Dominicana',
    'NCF',
    'RNC',
    'e-CF comprobante fiscal electrónico',
    'contador República Dominicana',
    'app para contadores RD',
  ],
  authors: [{ name: 'SubirFactura' }],
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: 'website',
    locale: 'es_DO',
    url: SITE_URL,
    siteName: 'SubirFactura',
    title: 'Cierra tu 606 de la DGII sin noches sin dormir',
    description:
      'Tus clientes fotografían sus facturas, la IA las lee y tú generas el 606 oficial de la DGII en un clic. Hecho en RD, para contadores. Empieza gratis.',
    images: [{ url: '/landing/exito.jpg', width: 1100, height: 800, alt: 'Contadores celebrando un cierre a tiempo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SubirFactura — tu 606 de la DGII, sin estrés',
    description:
      'Digitaliza las facturas de gastos de tus clientes con IA y genera el Formato 606 oficial en un clic.',
    images: ['/landing/exito.jpg'],
  },
  robots: { index: true, follow: true },
};

const DOLORES = [
  { icon: '🧾', text: 'Perseguir facturas por WhatsApp mes tras mes.' },
  { icon: '⌨️', text: 'Teclear cada NCF y RNC a mano… y rezar por no equivocarte.' },
  { icon: '🧮', text: 'Cuadrar el ITBIS y los montos a punta de calculadora.' },
  { icon: '⏰', text: 'La fecha límite del día 15 encima, otra vez.' },
];

const PASOS = [
  {
    n: '01',
    icon: '📸',
    title: 'Tu cliente toma la foto',
    text: 'Desde la app móvil, sin salir de su negocio. Si no hay señal, la cola offline la sube sola después.',
  },
  {
    n: '02',
    icon: '🤖',
    title: 'La IA la lee y valida',
    text: 'Lee el QR del e-CF y extrae NCF, RNC, fecha, ITBIS y montos. Verifica el RNC contra el padrón de la DGII. Lo dudoso lo marca para ti.',
  },
  {
    n: '03',
    icon: '📄',
    title: 'Tú generas el 606',
    text: 'Revisas, validas y descargas el TXT y el Excel oficiales de la DGII — por cada cliente y su RNC. Listo para subir.',
  },
];

const BENEFICIOS = [
  { icon: '📸', title: 'Captura desde el móvil', text: 'Offline-first: la factura se sube sola cuando vuelve la señal. Cero facturas perdidas.' },
  { icon: '🤖', title: 'Lectura con IA', text: 'Claude extrae cada campo con un nivel de confianza. Si algo no cuadra, lo manda a revisión — nunca inventa.' },
  { icon: '📄', title: '606 por cliente', text: 'Cada contribuyente con su propio RNC. TXT y Excel en el formato exacto que pide la DGII.' },
  { icon: '🔎', title: 'Verificación DGII en vivo', text: 'RNC, NCF y e-CF validados contra la DGII. Detecta comprobantes vencidos o inválidos antes de reportar.' },
  { icon: '🏢', title: 'Multi-empresa y roles', text: 'Un despacho, varios contadores y clientes. Cada quien ve solo lo suyo, con datos aislados por empresa.' },
  { icon: '🛡️', title: 'Nunca pierdas una factura', text: 'Detecta duplicados y reintenta sola si algo falla. Cada comprobante queda registrado y trazable.' },
];

const FAQS = [
  {
    q: '¿Necesito tarjeta de crédito para empezar?',
    a: 'No. El plan Gratis se activa al instante, sin tarjeta y sin compromiso. Pruébalo con tus clientes reales hoy mismo.',
  },
  {
    q: '¿Funciona con facturas electrónicas (e-CF)?',
    a: 'Sí. SubirFactura lee el código QR oficial del e-CF, que trae los datos directo de la DGII — más confiable que cualquier OCR.',
  },
  {
    q: '¿El 606 que genera es válido ante la DGII?',
    a: 'Sí. Generamos el TXT y el Excel en el formato oficial del Formato 606, por cada cliente con su propio RNC, listos para subir al portal de la DGII.',
  },
  {
    q: '¿Están seguros los datos de mis clientes?',
    a: 'Cada empresa está aislada de las demás y los permisos son por rol: cada persona ve únicamente lo que le corresponde. Tus datos son tuyos.',
  },
  {
    q: '¿Qué pasa si la IA no está segura de un dato?',
    a: 'Marca ese campo y envía la factura a revisión manual. Tú tienes la última palabra; el sistema nunca reporta un dato dudoso por su cuenta.',
  },
  {
    q: '¿En qué dispositivos funciona?',
    a: 'Tus clientes capturan desde la app móvil (iOS y Android) y tú gestionas todo desde el panel web en tu computadora.',
  },
];

function jsonLd() {
  const data = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'SubirFactura',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, iOS, Android',
      description:
        'Software para contadores dominicanos: digitaliza facturas de gastos con IA y genera el Formato 606 de la DGII.',
      url: SITE_URL,
      offers: [
        { '@type': 'Offer', name: 'Gratis', price: '0', priceCurrency: 'DOP' },
        { '@type': 'Offer', name: 'Pro', price: '1995', priceCurrency: 'DOP' },
        { '@type': 'Offer', name: 'Empresarial', price: '4995', priceCurrency: 'DOP' },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'SubirFactura',
      url: SITE_URL,
      areaServed: 'DO',
    },
  ];
  return JSON.stringify(data);
}

export default function Landing() {
  return (
    <div className="lp">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd() }} />

      {/* ===== Nav ===== */}
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <Link href="/" aria-label="SubirFactura — inicio">
            <Logo size={30} />
          </Link>
          <nav className="lp-nav-links" aria-label="Secciones">
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#beneficios">Beneficios</a>
            <a href="#precios">Precios</a>
            <a href="#faq">Preguntas</a>
          </nav>
          <div className="lp-nav-actions">
            <ThemeToggle />
            <AuthButtons variant="nav" />
          </div>
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section className="lp-hero">
        <div className="lp-hero-copy">
          <span className="lp-eyebrow">Hecho en República Dominicana 🇩🇴 · para contadores</span>
          <h1>
            Cierra tu <span className="hl-blue">606</span> sin{' '}
            <span className="hl-purple">noches sin dormir</span>.
          </h1>
          <p className="lp-lead">
            Tus clientes fotografían sus facturas. La IA lee NCF, RNC e ITBIS. Tú generas el
            Formato 606 oficial de la DGII en un clic. Así de simple.
          </p>
          <div className="lp-hero-cta">
            <AuthButtons variant="hero" />
          </div>
          <p className="lp-trust-line">✓ Gratis para empezar &nbsp;·&nbsp; ✓ Sin tarjeta &nbsp;·&nbsp; ✓ Listo en 2 minutos</p>
        </div>

        <div className="lp-hero-visual" aria-hidden>
          <div className="lp-board">
            <div className="lp-board-head">
              <span className="lp-board-dot" style={{ background: 'var(--m-red)' }} />
              <span className="lp-board-dot" style={{ background: 'var(--m-orange)' }} />
              <span className="lp-board-dot" style={{ background: 'var(--m-green)' }} />
              <span className="lp-board-title">Facturas · este mes</span>
            </div>
            {[
              { c: 'Colmado Don José', ncf: 'B0100000123', e: 'Validada', col: 'var(--m-green)' },
              { c: 'Ferretería Popular', ncf: 'B0200004511', e: 'En revisión', col: 'var(--m-orange)' },
              { c: 'CEIDI', ncf: 'E310000000071', e: 'En 606', col: 'var(--m-blue)' },
              { c: 'Farmacia Carol', ncf: 'B0100008820', e: 'Procesando', col: 'var(--m-purple)' },
            ].map((r) => (
              <div className="lp-board-row" key={r.ncf}>
                <span className="lp-board-client">{r.c}</span>
                <span className="lp-board-ncf">{r.ncf}</span>
                <span className="lp-status-chip" style={{ background: r.col }}>
                  {r.e}
                </span>
              </div>
            ))}
          </div>
          <div className="lp-float-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/hero-negocio.jpg" alt="Dueña de un negocio capturando una factura con su teléfono" />
          </div>
          <div className="lp-float-stat">
            <span className="lp-float-stat-emoji">🎉</span>
            <div>
              <strong>606 cerrado</strong>
              <span>35 días antes de la fecha límite</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Trust strip ===== */}
      <section className="lp-trust">
        <p>Pensado para el contador dominicano de verdad:</p>
        <div className="lp-trust-items">
          <span>🧾 Formato 606 y 607</span>
          <span>🔳 Lee el QR del e-CF</span>
          <span>🆔 Padrón RNC de la DGII</span>
          <span>🏢 Multi-empresa</span>
        </div>
      </section>

      {/* ===== Problema / agitación ===== */}
      <section className="lp-problem">
        <div className="lp-problem-copy">
          <span className="lp-tag">El cierre del 606, hoy</span>
          <h2>No tiene por qué robarte el sueño.</h2>
          <p className="lp-section-lead">
            Cada mes se repite la misma historia. Y cada mes te cuesta horas que no vuelven.
          </p>
          <ul className="lp-pain-list">
            {DOLORES.map((d) => (
              <li key={d.text}>
                <span className="lp-pain-icon">{d.icon}</span>
                {d.text}
              </li>
            ))}
          </ul>
        </div>
        <div className="lp-problem-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/dolor.jpg" alt="Formularios de impuestos y calculadora sobre un escritorio" />
        </div>
      </section>

      {/* ===== Cómo funciona ===== */}
      <section id="como-funciona" className="lp-how">
        <div className="lp-section-head">
          <span className="lp-tag">Cómo funciona</span>
          <h2>De la foto al 606 en tres pasos.</h2>
          <p className="lp-section-lead">Sin cajas de recibos. Sin Excel a medianoche.</p>
        </div>
        <div className="lp-steps">
          {PASOS.map((p) => (
            <div className="lp-step" key={p.n}>
              <span className="lp-step-n">{p.n}</span>
              <span className="lp-step-icon">{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Beneficios ===== */}
      <section id="beneficios" className="lp-benefits">
        <div className="lp-section-head">
          <span className="lp-tag">Beneficios</span>
          <h2>Todo lo que necesitas para reportar tranquilo.</h2>
        </div>
        <div className="lp-benefits-grid">
          {BENEFICIOS.map((b) => (
            <div className="lp-benefit" key={b.title}>
              <span className="lp-benefit-icon">{b.icon}</span>
              <h3>{b.title}</h3>
              <p>{b.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Felicidad / paz mental ===== */}
      <section className="lp-happy">
        <div className="lp-happy-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/paz-mental.jpg" alt="Contadora tranquila trabajando desde su teléfono" />
        </div>
        <div className="lp-happy-copy">
          <span className="lp-tag">Tu tranquilidad</span>
          <h2>Recupera tus noches. Y tu paz.</h2>
          <p className="lp-section-lead">
            Imagina llegar al día 15 con todo listo. Sin perseguir a nadie, sin miedo a un NCF mal
            tecleado, sin quedarte hasta tarde cuadrando montos.
          </p>
          <div className="lp-value-cards">
            <div className="lp-value-card">
              <strong>~2 min</strong>
              <span>ahorrados por cada factura que ya no capturas a mano</span>
            </div>
            <div className="lp-value-card">
              <strong>Horas</strong>
              <span>que recuperas cada mes para lo que de verdad importa</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOMO / urgencia ética (la fecha real de la DGII) ===== */}
      <section className="lp-fomo">
        <div className="lp-fomo-inner">
          <div className="lp-fomo-copy">
            <h2>La DGII no mueve la fecha.</h2>
            <p>
              El día 15 llega igual. La única pregunta es si llegas <strong>listo</strong> o
              <strong> corriendo</strong>. Cada mes que lo haces a mano son horas que no vuelven —
              empieza gratis hoy y que tu próximo cierre sea distinto.
            </p>
            <div className="lp-fomo-cta">
              <Link className="btn btn-primary btn-lg" href="/register">
                Comenzar gratis
              </Link>
              <span className="lp-fomo-note">Sin tarjeta · Se activa al instante</span>
            </div>
          </div>
          <div className="lp-fomo-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/exito.jpg" alt="Contadores celebrando un cierre del 606 a tiempo" />
          </div>
        </div>
      </section>

      {/* ===== Precios ===== */}
      <section id="precios" className="lp-pricing">
        <div className="lp-section-head">
          <span className="lp-tag">Precios</span>
          <h2>Planes pensados para República Dominicana.</h2>
          <p className="lp-section-lead">Empieza gratis. Crece cuando tu despacho crezca.</p>
        </div>
        <Pricing />
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="lp-faq">
        <div className="lp-section-head">
          <span className="lp-tag">Preguntas frecuentes</span>
          <h2>Lo que todo contador pregunta.</h2>
        </div>
        <div className="lp-faq-list">
          {FAQS.map((f) => (
            <details className="lp-faq-item" key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ===== CTA final ===== */}
      <section className="lp-final">
        <h2>Tu próximo día 15 puede ser distinto.</h2>
        <p>Empieza gratis hoy — tus clientes te lo van a agradecer.</p>
        <Link className="btn btn-primary btn-lg" href="/register">
          Crear mi cuenta gratis
        </Link>
      </section>

      {/* ===== Footer ===== */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <Logo size={26} />
            <p>Digitaliza las facturas de tus clientes y cierra tu 606 sin estrés. Hecho en RD 🇩🇴.</p>
          </div>
          <nav className="lp-footer-links" aria-label="Enlaces del pie">
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#beneficios">Beneficios</a>
            <a href="#precios">Precios</a>
            <a href="#faq">Preguntas</a>
            <Link href="/login">Iniciar sesión</Link>
            <Link href="/register">Crear cuenta</Link>
          </nav>
        </div>
        <div className="lp-footer-legal">
          <span>© 2026 SubirFactura · Digitalización de facturas y reportes DGII</span>
        </div>
      </footer>
    </div>
  );
}
