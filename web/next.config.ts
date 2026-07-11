import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // La verificación de tipos (tsc) sigue corriendo en el build; solo evitamos que
  // el linter bloquee la compilación (la config de ESLint del repo no carga el
  // plugin de Next, así que `next lint` da falsos "rule not found"). El lint se
  // corre aparte con `pnpm lint`.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
