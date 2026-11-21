-- Prévisualisations de pull/merge requests (#185, MVP). Désactivées par défaut, opt-in explicite par projet.
ALTER TABLE "Project" ADD COLUMN "previewsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Suivi minimal d'une preview par (application, numéro de PR). Aucune donnée sensible.
CREATE TABLE "ProjectPreview" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "prTitle" TEXT,
    "prUrl" TEXT,
    "headRef" TEXT NOT NULL,
    "headSha" TEXT,
    "baseRef" TEXT,
    "authorLogin" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "previewUrl" TEXT,
    "coolifyDeploymentUuid" TEXT,
    "error" TEXT,
    "lastDeployedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectPreview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectPreview_projectId_status_idx" ON "ProjectPreview"("projectId", "status");
CREATE INDEX "ProjectPreview_appId_idx" ON "ProjectPreview"("appId");
CREATE UNIQUE INDEX "ProjectPreview_projectId_appId_prNumber_key" ON "ProjectPreview"("projectId", "appId", "prNumber");

ALTER TABLE "ProjectPreview" ADD CONSTRAINT "ProjectPreview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectPreview" ADD CONSTRAINT "ProjectPreview_appId_fkey" FOREIGN KEY ("appId") REFERENCES "ProjectApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
