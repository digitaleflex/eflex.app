ALTER TABLE "Payment"
  ADD COLUMN "invoiceNumber" TEXT,
  ADD COLUMN "invoicedAt" TIMESTAMP(3),
  ADD COLUMN "refundedAt" TIMESTAMP(3),
  ADD COLUMN "refundRef" TEXT,
  ADD COLUMN "refundStatus" TEXT;

CREATE UNIQUE INDEX "Payment_invoiceNumber_key" ON "Payment"("invoiceNumber");

ALTER TABLE "Subscription" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
