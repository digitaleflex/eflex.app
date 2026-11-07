-- Applications Coolify des services annexes du plan (queue, scheduler…), par nom de service.
ALTER TABLE "Project" ADD COLUMN "coolifyWorkers" JSONB;
