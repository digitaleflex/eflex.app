-- Événements nommés agrégés et objectifs de conversion (#111, incrément prudent)
-- Minimisation : aucun identifiant visiteur, aucune propriété libre, uniquement un compteur
-- quotidien par nom d'événement validé. Rétention appliquée comme pour le trafic.

-- AlterTable
ALTER TABLE "ProjectAnalytics" ADD COLUMN "goalEvents" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "AnalyticsEventDaily" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AnalyticsEventDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsEventDaily_projectId_date_name_key" ON "AnalyticsEventDaily"("projectId", "date", "name");

-- CreateIndex
CREATE INDEX "AnalyticsEventDaily_projectId_date_idx" ON "AnalyticsEventDaily"("projectId", "date");

-- AddForeignKey
ALTER TABLE "AnalyticsEventDaily" ADD CONSTRAINT "AnalyticsEventDaily_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
