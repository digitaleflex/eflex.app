import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { Organization, Payment, User } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { planById } from '@/lib/plans'

const INK = rgb(0.08, 0.12, 0.2)
const MUTED = rgb(0.4, 0.45, 0.52)
const ACCENT = rgb(0.15, 0.39, 0.92)

export function invoiceCompany() {
  return {
    name: process.env.INVOICE_COMPANY_NAME?.trim() || 'Eflex',
    address: process.env.INVOICE_COMPANY_ADDRESS?.trim() || '',
    email: process.env.INVOICE_COMPANY_EMAIL?.trim() || 'admin@eflex.app',
    taxId: process.env.INVOICE_TAX_ID?.trim() || '',
  }
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })

/** Numéro stable et lisible, dérivé du paiement (idempotent). */
export function invoiceNumberFor(payment: Pick<Payment, 'id' | 'createdAt'>): string {
  const date = payment.createdAt
  const period = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  return `EFX-${period}-${payment.id.slice(-6).toUpperCase()}`
}

/** Attribue le numéro de facture au premier accès (ou le renvoie s'il existe). */
export async function ensureInvoiceNumber(payment: Payment): Promise<string> {
  if (payment.invoiceNumber) return payment.invoiceNumber
  const number = invoiceNumberFor(payment)
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { invoiceNumber: number, invoicedAt: new Date() },
    select: { invoiceNumber: true },
  })
  return updated.invoiceNumber ?? number
}

/** Facture PDF simple, lisible et sans dépendance de style externe. */
export async function generateInvoicePdf(
  payment: Payment,
  organization: Pick<Organization, 'name'>,
  user: Pick<User, 'name' | 'email'>,
): Promise<Uint8Array> {
  const company = invoiceCompany()
  const plan = planById(payment.plan)
  const number = await ensureInvoiceNumber(payment)

  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89]) // A4
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const { width, height } = page.getSize()
  const margin = 56

  // Les polices standard sont en WinAnsi : on remplace les espaces fines
  // (formatage français) et les caractères hors Latin-1 pour éviter un crash.
  const write = (text: string, options: Parameters<typeof page.drawText>[1]) =>
    page.drawText(
      text.replace(/[\u202F\u00A0]/g, ' ').replace(/[^\u0000-\u00FF]/g, '?'),
      options,
    )

  write(company.name, { x: margin, y: height - 72, size: 22, font: bold, color: INK })
  write('Facture', { x: margin, y: height - 102, size: 12, font, color: MUTED })
  write(number, { x: width - margin - bold.widthOfTextAtSize(number, 12), y: height - 78, size: 12, font: bold, color: ACCENT })

  const meta = [
    `Date : ${dateFormat.format(payment.createdAt)}`,
    `Statut : ${payment.status === 'approved' ? 'Payée' : payment.status}`,
  ]
  meta.forEach((line, index) => {
    write(line, { x: width - margin - font.widthOfTextAtSize(line, 10), y: height - 100 - index * 15, size: 10, font, color: MUTED })
  })

  let y = height - 160
  write('Facturé à', { x: margin, y, size: 10, font: bold, color: MUTED })
  y -= 18
  write(organization.name, { x: margin, y, size: 12, font: bold, color: INK })
  y -= 15
  write(user.name, { x: margin, y, size: 10, font, color: MUTED })
  y -= 14
  write(user.email, { x: margin, y, size: 10, font, color: MUTED })

  y -= 45
  page.drawRectangle({ x: margin, y: y - 8, width: width - margin * 2, height: 28, color: rgb(0.96, 0.97, 0.99) })
  write('Description', { x: margin + 10, y, size: 9, font: bold, color: MUTED })
  write('Montant', { x: width - margin - 70, y, size: 9, font: bold, color: MUTED })

  y -= 32
  write(`Abonnement Eflex — ${plan.label}`, { x: margin + 10, y, size: 11, font, color: INK })
  const amount = `${new Intl.NumberFormat('fr-FR').format(payment.amountFcfa)} FCFA`
  write(amount, { x: width - margin - 70, y, size: 11, font: bold, color: INK })

  y -= 20
  write(`Prestataire : ${payment.provider === 'kkiapay' ? 'Kkiapay' : 'FedaPay'}`, { x: margin + 10, y, size: 9, font, color: MUTED })
  if (payment.providerRef) y -= 14
  if (payment.providerRef) {
    write(`Référence : ${payment.providerRef}`, { x: margin + 10, y, size: 9, font, color: MUTED })
  }

  y -= 36
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.7, color: rgb(0.85, 0.88, 0.92) })
  y -= 24
  write('Total payé', { x: width - margin - 160, y, size: 11, font, color: MUTED })
  write(amount, { x: width - margin - 70, y, size: 13, font: bold, color: INK })

  const footer = [
    company.address,
    company.email,
    company.taxId ? `Identifiant fiscal : ${company.taxId}` : '',
  ].filter(Boolean)
  footer.forEach((line, index) => {
    write(line, { x: margin, y: 70 - index * 13, size: 8, font, color: MUTED })
  })
  write('Merci d’utiliser Eflex.', { x: margin, y: 35, size: 8, font, color: MUTED })

  return doc.save()
}
