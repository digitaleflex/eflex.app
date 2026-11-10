-- CreateTable
CREATE TABLE "ProjectDatabase" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "coolifyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "internalUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectDatabase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectDatabase_coolifyId_key" ON "ProjectDatabase"("coolifyId");
CREATE UNIQUE INDEX "ProjectDatabase_projectId_kind_key" ON "ProjectDatabase"("projectId", "kind");
CREATE INDEX "ProjectDatabase_projectId_idx" ON "ProjectDatabase"("projectId");

ALTER TABLE "ProjectDatabase" ADD CONSTRAINT "ProjectDatabase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
