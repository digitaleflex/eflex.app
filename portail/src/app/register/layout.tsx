import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Créer un compte — Eflex',
  description: 'Créez votre compte Eflex pour déployer vos applications depuis un dépôt GitHub.',
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children
}
