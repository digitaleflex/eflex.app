import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Nouvelle phrase secrète — Eflex',
  description: 'Définissez une nouvelle phrase secrète pour votre compte Eflex.',
}

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
