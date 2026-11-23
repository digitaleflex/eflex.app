import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://docs.eflex.app',
  integrations: [
    starlight({
      title: 'EFLEX Docs',
      description: 'Documentation produit EFLEX : déploiement, domaines, bases de données, exploitation et organisation.',
      defaultLocale: 'root',
      locales: {
        root: { label: 'Français', lang: 'fr' },
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/digitaleflex/eflex.app' },
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
    }),
  ],
});
