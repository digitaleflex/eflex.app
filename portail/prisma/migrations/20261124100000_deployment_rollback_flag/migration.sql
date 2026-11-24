-- Retour arrière persisté (audit M4) : permet de ré-enfiler un job perdu sans perdre sa cible.
ALTER TABLE "Deployment" ADD COLUMN "rollback" BOOLEAN NOT NULL DEFAULT false;
