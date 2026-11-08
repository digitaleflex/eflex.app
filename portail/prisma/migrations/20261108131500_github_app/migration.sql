-- GitHub App : installations liées aux utilisateurs et idempotence des webhooks (issue 07).
CREATE TABLE "GitInstallation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "accountLogin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitInstallation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GitInstallation_installationId_key" ON "GitInstallation"("installationId");
CREATE INDEX "GitInstallation_userId_idx" ON "GitInstallation"("userId");

ALTER TABLE "GitInstallation"
    ADD CONSTRAINT "GitInstallation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Project"
    ADD COLUMN "repoFullName" TEXT,
    ADD COLUMN "installationId" TEXT,
    ADD COLUMN "productionBranch" TEXT;

CREATE INDEX "Project_repoFullName_idx" ON "Project"("repoFullName");
