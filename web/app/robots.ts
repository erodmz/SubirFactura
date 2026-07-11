import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://subirfactura.do';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // El panel y los flujos privados no aportan a SEO y no deben indexarse.
      disallow: ['/app', '/orgs/', '/login', '/register', '/reset-password', '/verificar-correo'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
