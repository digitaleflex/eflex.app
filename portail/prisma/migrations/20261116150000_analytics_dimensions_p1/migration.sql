-- AlterTable
ALTER TABLE "ProjectAnalytics" ADD COLUMN "collectReferrer" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ProjectAnalytics" ADD COLUMN "collectDevice" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "TrafficDailyDimension" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dimension" VARCHAR(32) NOT NULL,
    "value" VARCHAR(255) NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "visitors" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TrafficDailyDimension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDailyDimensionVisitor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dimension" VARCHAR(32) NOT NULL,
    "value" VARCHAR(255) NOT NULL,
    "hash" VARCHAR(64) NOT NULL,

    CONSTRAINT "AnalyticsDailyDimensionVisitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrafficDailyDimension_projectId_date_dimension_value_key" ON "TrafficDailyDimension"("projectId", "date", "dimension", "value");

-- CreateIndex
CREATE INDEX "TrafficDailyDimension_projectId_date_dimension_idx" ON "TrafficDailyDimension"("projectId", "date", "dimension");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDailyDimVisitor_projectId_date_dim_value_hash_key" ON "AnalyticsDailyDimensionVisitor"("projectId", "date", "dimension", "value", "hash");

-- CreateIndex
CREATE INDEX "AnalyticsDailyDimensionVisitor_projectId_date_dimension_idx" ON "AnalyticsDailyDimensionVisitor"("projectId", "date", "dimension");

-- AddForeignKey
ALTER TABLE "TrafficDailyDimension" ADD CONSTRAINT "TrafficDailyDimension_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDailyDimensionVisitor" ADD CONSTRAINT "AnalyticsDailyDimensionVisitor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
