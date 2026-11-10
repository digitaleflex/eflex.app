-- D2 (monorepo multi-applications), lot B : phase « expand » uniquement.
--
-- Aucune donnée existante n'est supprimée, renommée ou rendue obligatoire :
--   * nouvelle table "ProjectApp" (vide à la création) ;
--   * nouvelles colonnes nullables sur "Deployment", "EnvVar" et "ProjectDomain".
-- Le code applicatif continue de lire "Project.plan|port|domain|coolifyAppId|tls*" :
-- le comportement d'exécution est inchangé tant que le drapeau EFLEX_MULTI_APP
-- n'est pas branché et que le backfill n'a pas créé d'application.

-- CreateTable
CREATE TABLE "ProjectApp" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "root" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "plan" JSONB NOT NULL,
    "framework" TEXT NOT NULL,
    "runtime" TEXT,
    "port" INTEGER NOT NULL DEFAULT 80,
    "domain" TEXT,
    "coolifyAppId" TEXT,
    "tlsValid" BOOLEAN,
    "tlsExpiresAt" TIMESTAMP(3),
    "tlsCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectApp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectApp_domain_key" ON "ProjectApp"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectApp_projectId_name_key" ON "ProjectApp"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectApp_projectId_root_key" ON "ProjectApp"("projectId", "root");

-- CreateIndex
CREATE INDEX "ProjectApp_projectId_idx" ON "ProjectApp"("projectId");

-- CreateIndex
CREATE INDEX "ProjectApp_coolifyAppId_idx" ON "ProjectApp"("coolifyAppId");

-- AlterTable : rattachement d'un déploiement à une application (NULL = historique mono-app).
ALTER TABLE "Deployment" ADD COLUMN "appId" TEXT;
ALTER TABLE "Deployment" ADD COLUMN "groupId" TEXT;

-- AlterTable : portée des variables et des alias DNS (NULL = portée projet).
ALTER TABLE "EnvVar" ADD COLUMN "appId" TEXT;
ALTER TABLE "ProjectDomain" ADD COLUMN "appId" TEXT;

-- CreateIndex
CREATE INDEX "Deployment_appId_idx" ON "Deployment"("appId");

-- CreateIndex
CREATE INDEX "Deployment_groupId_idx" ON "Deployment"("groupId");

-- CreateIndex
CREATE INDEX "EnvVar_appId_idx" ON "EnvVar"("appId");

-- CreateIndex
CREATE INDEX "ProjectDomain_appId_idx" ON "ProjectDomain"("appId");

-- AddForeignKey
ALTER TABLE "ProjectApp" ADD CONSTRAINT "ProjectApp_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_appId_fkey" FOREIGN KEY ("appId") REFERENCES "ProjectApp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvVar" ADD CONSTRAINT "EnvVar_appId_fkey" FOREIGN KEY ("appId") REFERENCES "ProjectApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDomain" ADD CONSTRAINT "ProjectDomain_appId_fkey" FOREIGN KEY ("appId") REFERENCES "ProjectApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unicité des variables de portée projet (index partiel non modélisable par Prisma).
-- PostgreSQL traite chaque NULL comme distinct : `@@unique([projectId, key])` protège
-- aujourd'hui les lignes `appId IS NULL`, mais ne le fera plus quand le lot C/D
-- remplacera cette contrainte par `(projectId, appId, key)`. Cet index partiel garde
-- la propriété « une clé par projet pour les variables non rattachées à une app ».
-- Il est volontairement conservé tel quel : `prisma migrate dev` peut proposer de le
-- supprimer (dérive), ne jamais accepter (voir docs/architecture/monorepo-multi-app.md).
CREATE UNIQUE INDEX "EnvVar_project_scope_key" ON "EnvVar"("projectId", "key") WHERE "appId" IS NULL;
