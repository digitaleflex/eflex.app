import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  name: z.string().trim().min(1, 'Indiquez votre nom.').max(100),
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.'),
  password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères.')
    .max(200, 'Le mot de passe est trop long.'),
})

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 },
    )
  }

  const { name, email, password } = parsed.data

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json(
      { error: 'Un compte existe déjà avec cette adresse. Connectez-vous ou utilisez une autre adresse.' },
      { status: 409 },
    )
  }

  await prisma.user.create({
    data: { name, email, hashedPassword: await hash(password, 12) },
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}
