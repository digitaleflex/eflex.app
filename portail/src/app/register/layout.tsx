import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Créer un compte — EFLEX',
  description: 'Créez votre compte EFLEX pour déployer vos applications depuis un dépôt GitHub.',
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children
}
