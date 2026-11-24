import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://docs.eflex.app',
  integrations: [
    starlight({
      title: 'EFLEX Docs',
      description:
        'Documentation produit EFLEX : déployer, configurer et exploiter vos applications.',
      defaultLocale: 'root',
      locales: {
        root: { label: 'Français', lang: 'fr' },
      },
      logo: {
        light: './src/assets/logo-horizontal.webp',
        dark: './src/assets/logo-horizontal-inverse.webp',
        replacesTitle: true,
        alt: 'EFLEX',
      },
      favicon: '/favicon.png',
      head: [
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500;600&display=swap',
          },
        },
      ],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/digitaleflex/eflex.app',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/digitaleflex/eflex.app/edit/main/docs-site/',
      },
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Démarrer',
          autogenerate: { directory: 'demarrer' },
        },
        {
          label: 'Guides pratiques',
          autogenerate: { directory: 'guides' },
        },
        {
          label: 'Référence',
          autogenerate: { directory: 'reference' },
        },
        {
          label: 'Comprendre',
          autogenerate: { directory: 'comprendre' },
        },
      ],
      lastUpdated: true,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
    }),
  ],
});
