import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Nouveau mot de passe — Eflex',
  description: 'Définissez un nouveau mot de passe pour votre compte Eflex.',
}

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
