import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Mot de passe oublié — Eflex',
  description: 'Recevez un lien pour réinitialiser la phrase secrète de votre compte Eflex.',
}

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
