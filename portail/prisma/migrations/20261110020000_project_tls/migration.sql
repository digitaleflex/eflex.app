-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "tlsCheckedAt" TIMESTAMP(3),
ADD COLUMN     "tlsExpiresAt" TIMESTAMP(3),
ADD COLUMN     "tlsValid" BOOLEAN;
