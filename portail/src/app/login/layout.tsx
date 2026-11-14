import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Connexion — EFLEX',
  description: 'Connectez-vous à votre espace EFLEX pour gérer vos projets et déploiements.',
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
