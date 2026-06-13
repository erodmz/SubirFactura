import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FacturaRD',
  description: 'Digitalización de facturas y reportes 606/607 — DGII',
};

// Fija el tema antes del primer render (evita parpadeo claro→oscuro).
const themeScript = `(function(){try{var t=localStorage.getItem('facturard_theme');document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:'dark';}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
