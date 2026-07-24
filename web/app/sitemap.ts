import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://subirfactura.do';

export default function sitemap(): MetadataRoute.Sitemap {
  // Página pública principal. Las secciones (#precios, #faq…) viven en la misma
  // URL, así que una sola entrada cubre el landing.
  return [
    {
      url: SITE_URL,
      changeFrequency: 'weekly',
      priority: 1,
    },
    { url: `${SITE_URL}/privacidad`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terminos`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
