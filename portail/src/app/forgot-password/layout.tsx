import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Mot de passe oublié — EFLEX',
  description: 'Recevez un lien pour réinitialiser le mot de passe de votre compte EFLEX.',
}

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
