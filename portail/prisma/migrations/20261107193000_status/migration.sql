-- Relevés de santé (page de statut) et journal d'incidents.
CREATE TABLE "StatusCheck" (
    "id" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "component" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER,

    CONSTRAINT "StatusCheck_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StatusCheck_checkedAt_idx" ON "StatusCheck"("checkedAt");
CREATE INDEX "StatusCheck_component_checkedAt_idx" ON "StatusCheck"("component", "checkedAt");

CREATE TABLE "StatusIncident" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'minor',
    "status" TEXT NOT NULL DEFAULT 'investigating',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusIncident_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StatusIncident_startedAt_idx" ON "StatusIncident"("startedAt");
