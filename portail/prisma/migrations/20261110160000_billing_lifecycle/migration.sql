-- Cycle de vie de la facturation (#18) et administration des organisations (#27).

-- Suspension administrative : ne supprime rien, gèle seulement les créations.
ALTER TABLE "Organization" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "suspensionReason" TEXT;

-- Période de grâce, override manuel, crédit prorata et quotas temporaires.
ALTER TABLE "Subscription" ADD COLUMN "graceUntil" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "manualOverride" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Subscription" ADD COLUMN "manualOverrideAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "manualOverrideBy" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "manualOverrideReason" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "creditFcfa" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subscription" ADD COLUMN "projectLimitOverride" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN "memberLimitOverride" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN "quotaOverrideUntil" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "note" TEXT;

-- Part du prix réglée par un crédit interne (prorata) sur un paiement.
ALTER TABLE "Payment" ADD COLUMN "creditFcfa" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Organization_suspendedAt_idx" ON "Organization"("suspendedAt");
CREATE INDEX "Subscription_graceUntil_idx" ON "Subscription"("graceUntil");
