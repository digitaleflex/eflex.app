-- Plan de build détecté à la création du projet (voir packages/detector).
ALTER TABLE "Project" ADD COLUMN "plan" JSONB,
ADD COLUMN "detection" JSONB;
