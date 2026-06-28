import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SubirFactura',
  description: 'Digitalización de facturas y reportes 606/607 — DGII',
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
