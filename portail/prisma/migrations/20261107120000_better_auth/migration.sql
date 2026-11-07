-- Migration NextAuth → Better Auth, en conservant les comptes existants.
--
--  * User.emailVerified (date) → booléen ; User.name devient obligatoire.
--  * User.hashedPassword (bcrypt) → Account(providerId = 'credential').password :
--    les mots de passe existants restent valides (hash/verify bcrypt côté application).
--  * Account : colonnes renommées au format Better Auth, jetons OAuth conservés.
--  * Session et VerificationToken : recréées (les sessions NextAuth étaient des JWT
--    en cookie, aucune session n'est stockée en base ; les utilisateurs devront se reconnecter).

-- ── User ────────────────────────────────────────────────────────────────────
-- Better Auth enregistre et recherche les e-mails en minuscules.
UPDATE "User" u
SET "email" = lower(u."email")
WHERE u."email" <> lower(u."email")
  AND NOT EXISTS (SELECT 1 FROM "User" o WHERE o."email" = lower(u."email"));

UPDATE "User" SET "name" = split_part("email", '@', 1) WHERE "name" IS NULL OR btrim("name") = '';

ALTER TABLE "User"
  ALTER COLUMN "name" SET NOT NULL,
  ALTER COLUMN "emailVerified" TYPE BOOLEAN USING ("emailVerified" IS NOT NULL);
ALTER TABLE "User"
  ALTER COLUMN "emailVerified" SET DEFAULT false,
  ALTER COLUMN "emailVerified" SET NOT NULL;

-- ── Account : colonnes au format Better Auth ────────────────────────────────
DROP INDEX "Account_provider_providerAccountId_key";

ALTER TABLE "Account" RENAME COLUMN "provider" TO "providerId";
ALTER TABLE "Account" RENAME COLUMN "providerAccountId" TO "accountId";
ALTER TABLE "Account" RENAME COLUMN "access_token" TO "accessToken";
ALTER TABLE "Account" RENAME COLUMN "refresh_token" TO "refreshToken";
ALTER TABLE "Account" RENAME COLUMN "id_token" TO "idToken";

ALTER TABLE "Account"
  ADD COLUMN "accessTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "refreshTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "password" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- NextAuth stockait l'expiration en secondes Unix.
UPDATE "Account" SET "accessTokenExpiresAt" = to_timestamp("expires_at") WHERE "expires_at" IS NOT NULL;

ALTER TABLE "Account"
  ALTER COLUMN "updatedAt" DROP DEFAULT,
  DROP COLUMN "expires_at",
  DROP COLUMN "type",
  DROP COLUMN "token_type",
  DROP COLUMN "session_state";

-- ── Mots de passe existants → compte « credential » ────────────────────────
INSERT INTO "Account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
SELECT 'cred_' || "id", "id", 'credential', "id", "hashedPassword", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User"
WHERE "hashedPassword" IS NOT NULL;

ALTER TABLE "User" DROP COLUMN "hashedPassword";

-- ── Session ─────────────────────────────────────────────────────────────────
DROP TABLE "Session";

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Verification (remplace VerificationToken) ───────────────────────────────
DROP TABLE "VerificationToken";

CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");
