import { describe, expect, it } from 'vitest'
import type { Payment } from '@prisma/client'
import { generateInvoicePdf, invoiceNumberFor } from './invoices'

const payment = {
  id: 'cmabcdef123456',
  reference: 'eflex_ref',
  organizationId: 'org',
  userId: 'user',
  plan: 'pro',
  provider: 'kkiapay',
  providerRef: 'tx_123',
  amountFcfa: 29_000,
  status: 'approved',
  invoiceNumber: 'EFX-202611-123456',
  invoicedAt: new Date('2026-11-10T10:00:00Z'),
  refundedAt: null,
  refundRef: null,
  refundStatus: null,
  createdAt: new Date('2026-11-10T09:00:00Z'),
  updatedAt: new Date('2026-11-10T10:00:00Z'),
} as Payment

describe('factures', () => {
  it('génère un numéro stable à partir du paiement', () => {
    expect(invoiceNumberFor(payment)).toBe('EFX-202611-123456')
  })

  it('produit un PDF valide', async () => {
    const pdf = await generateInvoicePdf(payment, { name: 'EFLEX SARL' }, { name: 'Client Test', email: 'client@example.com' })
    expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe('%PDF')
    expect(pdf.byteLength).toBeGreaterThan(1000)
  })
})
