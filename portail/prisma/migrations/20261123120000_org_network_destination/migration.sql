-- Réseau Docker par organisation (S5, #171) : uuid de la destination Coolify, rempli à la demande.
ALTER TABLE "Organization" ADD COLUMN "coolifyDestinationUuid" TEXT;
