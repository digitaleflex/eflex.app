import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site-url'

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl()
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard',
        '/admin',
        '/api',
        '/forgot-password',
        '/reset-password',
        '/verify-email',
        '/invitations',
        '/maintenance',
      ],
    },
    sitemap: new URL('/sitemap.xml', base).toString(),
  }
}
