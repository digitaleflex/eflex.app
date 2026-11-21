-- Surveillance continue des sites clients (#177) : sondes HTTP/DNS/TLS, incidents et rétablissement.

-- CreateTable
CREATE TABLE "ProjectSiteMonitor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "label" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "lastStatus" TEXT NOT NULL DEFAULT 'unknown',
    "lastHttpStatus" INTEGER,
    "lastLatencyMs" INTEGER,
    "lastDnsOk" BOOLEAN,
    "lastTlsOk" BOOLEAN,
    "lastTlsExpiresAt" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "consecutiveSuccesses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSiteMonitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSiteIncident" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "cause" TEXT,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "openedNotifiedAt" TIMESTAMP(3),
    "resolvedNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSiteIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSiteMonitor_projectId_host_key" ON "ProjectSiteMonitor"("projectId", "host");

-- CreateIndex
CREATE INDEX "ProjectSiteMonitor_projectId_lastCheckedAt_idx" ON "ProjectSiteMonitor"("projectId", "lastCheckedAt");

-- CreateIndex
CREATE INDEX "ProjectSiteMonitor_organizationId_lastStatus_idx" ON "ProjectSiteMonitor"("organizationId", "lastStatus");

-- CreateIndex
CREATE INDEX "ProjectSiteMonitor_enabled_lastCheckedAt_idx" ON "ProjectSiteMonitor"("enabled", "lastCheckedAt");

-- CreateIndex
CREATE INDEX "ProjectSiteIncident_projectId_openedAt_idx" ON "ProjectSiteIncident"("projectId", "openedAt" DESC);

-- CreateIndex
CREATE INDEX "ProjectSiteIncident_organizationId_status_openedAt_idx" ON "ProjectSiteIncident"("organizationId", "status", "openedAt" DESC);

-- CreateIndex
CREATE INDEX "ProjectSiteIncident_monitorId_status_openedAt_idx" ON "ProjectSiteIncident"("monitorId", "status", "openedAt" DESC);

-- CreateIndex
CREATE INDEX "ProjectSiteIncident_status_openedAt_idx" ON "ProjectSiteIncident"("status", "openedAt" DESC);

-- AddForeignKey
ALTER TABLE "ProjectSiteMonitor" ADD CONSTRAINT "ProjectSiteMonitor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSiteMonitor" ADD CONSTRAINT "ProjectSiteMonitor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSiteIncident" ADD CONSTRAINT "ProjectSiteIncident_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "ProjectSiteMonitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSiteIncident" ADD CONSTRAINT "ProjectSiteIncident_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSiteIncident" ADD CONSTRAINT "ProjectSiteIncident_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
