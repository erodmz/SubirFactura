import type { Metadata } from 'next';
import './globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://subirfactura.do';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'SubirFactura — Digitaliza facturas y cierra tu 606 de la DGII',
    template: '%s · SubirFactura',
  },
  description:
    'Software para contadores en República Dominicana. Digitaliza las facturas de gastos de tus clientes con IA y genera el Formato 606 oficial de la DGII en un clic.',
  applicationName: 'SubirFactura',
};

// Fija el tema antes del primer render (evita parpadeo claro→oscuro).
// Sin preferencia guardada → sigue al sistema operativo.
const themeScript = `(function(){try{var t=localStorage.getItem('facturard_theme');var sys=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:sys;}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
