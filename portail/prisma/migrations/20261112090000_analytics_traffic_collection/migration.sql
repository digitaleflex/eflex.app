-- CreateTable
CREATE TABLE "ProjectAnalytics" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "publicKey" TEXT NOT NULL,
    "respectDnt" BOOLEAN NOT NULL DEFAULT true,
    "collectPath" BOOLEAN NOT NULL DEFAULT true,
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrafficDailyStat" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "path" VARCHAR(500) NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TrafficDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAnalytics_projectId_key" ON "ProjectAnalytics"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAnalytics_publicKey_key" ON "ProjectAnalytics"("publicKey");

-- CreateIndex
CREATE INDEX "ProjectAnalytics_projectId_idx" ON "ProjectAnalytics"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "TrafficDailyStat_projectId_date_path_key" ON "TrafficDailyStat"("projectId", "date", "path");

-- CreateIndex
CREATE INDEX "TrafficDailyStat_projectId_date_idx" ON "TrafficDailyStat"("projectId", "date");

-- AddForeignKey
ALTER TABLE "ProjectAnalytics" ADD CONSTRAINT "ProjectAnalytics_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrafficDailyStat" ADD CONSTRAINT "TrafficDailyStat_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
