-- Bus d'événements temps réel (SSE).
CREATE TABLE "Event" (
  "id" BIGSERIAL NOT NULL,
  "type" TEXT NOT NULL,
  "audience" TEXT NOT NULL DEFAULT 'org',
  "organizationId" TEXT,
  "userId" TEXT,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Event_createdAt_idx" ON "Event"("createdAt");
CREATE INDEX "Event_organizationId_id_idx" ON "Event"("organizationId", "id");
