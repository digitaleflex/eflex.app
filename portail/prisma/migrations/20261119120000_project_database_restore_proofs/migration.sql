-- Preuve de restauration des bases managées : dernière tentative et dernière réussite, consignées pour le suivi.
ALTER TABLE "ProjectDatabase" ADD COLUMN "lastRestoreExecutionId" TEXT;
ALTER TABLE "ProjectDatabase" ADD COLUMN "lastRestoreBackupCreatedAt" TIMESTAMP(3);
ALTER TABLE "ProjectDatabase" ADD COLUMN "lastRestoreImportId" TEXT;
ALTER TABLE "ProjectDatabase" ADD COLUMN "lastRestoreStartedAt" TIMESTAMP(3);
ALTER TABLE "ProjectDatabase" ADD COLUMN "lastRestoreFinishedAt" TIMESTAMP(3);
ALTER TABLE "ProjectDatabase" ADD COLUMN "lastRestoreStatus" TEXT;
ALTER TABLE "ProjectDatabase" ADD COLUMN "lastSuccessfulRestoreAt" TIMESTAMP(3);
ALTER TABLE "ProjectDatabase" ADD COLUMN "lastSuccessfulRestoreBackupCreatedAt" TIMESTAMP(3);
