-- Sauvegardes planifiées des bases managées (planification Coolify et date de mise en place).
ALTER TABLE "ProjectDatabase" ADD COLUMN "backupId" TEXT;
ALTER TABLE "ProjectDatabase" ADD COLUMN "backupScheduledAt" TIMESTAMP(3);
