CREATE TABLE "SpecificationImport" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "document" TEXT NOT NULL,
  "pointers" TEXT NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpecificationImport_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SpecificationImport" ADD CONSTRAINT "SpecificationImport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiEndpoint" ADD COLUMN "sourceImportId" TEXT, ADD COLUMN "sourcePointer" TEXT NOT NULL DEFAULT '', ADD COLUMN "sourceDefinition" TEXT NOT NULL DEFAULT '{}', ADD COLUMN "sourceBaseline" TEXT NOT NULL DEFAULT '{}', ADD COLUMN "serverUrl" TEXT NOT NULL DEFAULT '', ADD COLUMN "auth" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "ApiEndpoint" ADD CONSTRAINT "ApiEndpoint_sourceImportId_fkey" FOREIGN KEY ("sourceImportId") REFERENCES "SpecificationImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EndpointParam" ADD COLUMN "schema" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "RequestBody" ADD COLUMN "content" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "EndpointResponse" ADD COLUMN "statusKey" TEXT NOT NULL DEFAULT '';
CREATE INDEX "SpecificationImport_projectId_idx" ON "SpecificationImport"("projectId");
CREATE INDEX "ApiEndpoint_sourceImportId_idx" ON "ApiEndpoint"("sourceImportId");
