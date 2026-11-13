import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site-url'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl()
  const now = new Date()
  const paths = ['/', '/tarifs', '/status', '/mentions-legales', '/conditions', '/confidentialite']
  return paths.map((path) => ({
    url: new URL(path, base).toString(),
    lastModified: now,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : 0.6,
  }))
}
