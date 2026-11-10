-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "coolifyPrivateKeyUuid" TEXT,
ADD COLUMN     "githubDeployKeyId" INTEGER,
ADD COLUMN     "repoPrivate" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GitPat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "scopes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitPat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitPat_userId_key" ON "GitPat"("userId");

-- AddForeignKey
ALTER TABLE "GitPat" ADD CONSTRAINT "GitPat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
