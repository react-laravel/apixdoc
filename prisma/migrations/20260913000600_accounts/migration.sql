ALTER TABLE "User"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "accountVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "resetTokenHash" TEXT,
ADD COLUMN "resetExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD CONSTRAINT "User_status_check" CHECK ("status" IN ('active', 'disabled', 'deleted'));
CREATE UNIQUE INDEX "User_resetTokenHash_key" ON "User"("resetTokenHash");
CREATE INDEX "User_status_createdAt_id_idx" ON "User"("status", "createdAt", "id");
