-- AlterTable: installation check (#109)
ALTER TABLE "ProjectAnalytics" ADD COLUMN "lastReceivedAt" TIMESTAMP(3);

-- CreateTable: alertes de trafic sur données agrégées (#113)
CREATE TABLE "AnalyticsAlert" (
    "id" TEXT NOT NULL,
    "analyticsId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "thresholdPct" INTEGER NOT NULL,
    "minBaseline" INTEGER NOT NULL DEFAULT 20,
    "windowDays" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cooldownHours" INTEGER NOT NULL DEFAULT 24,
    "lastTriggeredAt" TIMESTAMP(3),
    "lastEvaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsAlert_analyticsId_type_key" ON "AnalyticsAlert"("analyticsId", "type");

-- CreateIndex
CREATE INDEX "AnalyticsAlert_analyticsId_enabled_idx" ON "AnalyticsAlert"("analyticsId", "enabled");

-- AddForeignKey
ALTER TABLE "AnalyticsAlert" ADD CONSTRAINT "AnalyticsAlert_analyticsId_fkey" FOREIGN KEY ("analyticsId") REFERENCES "ProjectAnalytics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
