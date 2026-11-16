-- CreateTable
CREATE TABLE "TrafficDailySiteStat" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "visitors" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TrafficDailySiteStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDailyVisitor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "hash" VARCHAR(64) NOT NULL,

    CONSTRAINT "AnalyticsDailyVisitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrafficDailySiteStat_projectId_date_key" ON "TrafficDailySiteStat"("projectId", "date");

-- CreateIndex
CREATE INDEX "TrafficDailySiteStat_projectId_date_idx" ON "TrafficDailySiteStat"("projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDailyVisitor_projectId_date_hash_key" ON "AnalyticsDailyVisitor"("projectId", "date", "hash");

-- CreateIndex
CREATE INDEX "AnalyticsDailyVisitor_projectId_date_idx" ON "AnalyticsDailyVisitor"("projectId", "date");

-- AddForeignKey
ALTER TABLE "TrafficDailySiteStat" ADD CONSTRAINT "TrafficDailySiteStat_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDailyVisitor" ADD CONSTRAINT "AnalyticsDailyVisitor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
