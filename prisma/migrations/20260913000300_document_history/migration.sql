ALTER TABLE "Project" ADD COLUMN "layoutVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "SpecificationImport" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ApiEndpoint" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "EndpointParam" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EndpointHeader" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EndpointResponse" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "EndpointRevision" (
 "id" TEXT NOT NULL PRIMARY KEY, "endpointId" TEXT NOT NULL, "version" INTEGER NOT NULL, "action" TEXT NOT NULL,
 "actorName" TEXT NOT NULL, "actorId" TEXT, "snapshot" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "EndpointRevision_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "ApiEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EndpointRevision_endpointId_version_key" ON "EndpointRevision"("endpointId", "version");
CREATE INDEX "EndpointRevision_endpointId_createdAt_idx" ON "EndpointRevision"("endpointId", "createdAt");
