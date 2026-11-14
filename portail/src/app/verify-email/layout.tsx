import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Vérification de l’e-mail — EFLEX',
  description: 'Vérifiez votre adresse e-mail pour activer votre compte EFLEX.',
}

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return children
}
