-- Multi-tenant : plugins Better Auth « organization » et « admin ».
--  * Chaque utilisateur existant reçoit une organisation personnelle (il en est propriétaire).
--  * Tous ses projets sont rattachés à cette organisation.

-- ── Plugin admin ────────────────────────────────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN "role" TEXT,
  ADD COLUMN "banned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "banReason" TEXT,
  ADD COLUMN "banExpires" TIMESTAMP(3);

ALTER TABLE "Session"
  ADD COLUMN "activeOrganizationId" TEXT,
  ADD COLUMN "impersonatedBy" TEXT;

-- ── Organisations ───────────────────────────────────────────────────────────
CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "logo" TEXT,
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

CREATE TABLE "Member" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'member',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Member_organizationId_userId_key" ON "Member"("organizationId", "userId");
CREATE INDEX "Member_userId_idx" ON "Member"("userId");

CREATE TABLE "Invitation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "inviterId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Invitation_organizationId_idx" ON "Invitation"("organizationId");
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

ALTER TABLE "Member" ADD CONSTRAINT "Member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Member" ADD CONSTRAINT "Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Organisation personnelle des utilisateurs existants ─────────────────────
-- Le slug est dérivé de l'identifiant (unique, stable) : l'utilisateur pourra le renommer.
INSERT INTO "Organization" ("id", "name", "slug")
SELECT 'org_' || u."id", u."name", 'u-' || lower(u."id")
FROM "User" u;

INSERT INTO "Member" ("id", "organizationId", "userId", "role")
SELECT 'mem_' || u."id", 'org_' || u."id", u."id", 'owner'
FROM "User" u;

-- ── Projets rattachés à une organisation ────────────────────────────────────
ALTER TABLE "Project" ADD COLUMN "organizationId" TEXT;
UPDATE "Project" SET "organizationId" = 'org_' || "userId";
ALTER TABLE "Project" ALTER COLUMN "organizationId" SET NOT NULL;
CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
