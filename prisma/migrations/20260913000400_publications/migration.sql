ALTER TABLE "Project" ADD COLUMN "settingsVersion" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "publicationVersion" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "publicationInitialized" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "publishedDocumentId" TEXT, ADD COLUMN "publicationSequence" INTEGER NOT NULL DEFAULT 0;
UPDATE "Project" SET "publicationInitialized" = false WHERE "isPublic" = true;
CREATE TABLE "ProjectSettingsRevision" (
 "id" TEXT NOT NULL PRIMARY KEY, "projectId" TEXT NOT NULL, "version" INTEGER NOT NULL, "snapshot" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ProjectSettingsRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProjectSettingsRevision_projectId_version_key" ON "ProjectSettingsRevision"("projectId", "version");
CREATE TABLE "PublishedDocument" (
 "id" TEXT NOT NULL PRIMARY KEY, "projectId" TEXT NOT NULL, "number" INTEGER NOT NULL, "title" TEXT NOT NULL, "note" TEXT NOT NULL DEFAULT '', "content" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "actorName" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revokedAt" TIMESTAMP(3),
 CONSTRAINT "PublishedDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PublishedDocument_projectId_number_key" ON "PublishedDocument"("projectId", "number");
CREATE TABLE "PublicationEvent" (
 "id" TEXT NOT NULL PRIMARY KEY, "projectId" TEXT NOT NULL, "publicationId" TEXT, "action" TEXT NOT NULL, "actorName" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PublicationEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PublicationEvent_projectId_createdAt_idx" ON "PublicationEvent"("projectId", "createdAt");
