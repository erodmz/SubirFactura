import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FacturaRD',
  description: 'Digitalización de facturas y reportes 606/607 — DGII',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
