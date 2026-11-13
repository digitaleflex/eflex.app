import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Connexion — Eflex',
  description: 'Connectez-vous à votre espace Eflex pour gérer vos projets et déploiements.',
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
