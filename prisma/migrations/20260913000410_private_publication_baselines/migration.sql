-- Existing team-only documentation links also receive a private upgrade baseline.
-- A deliberately withdrawn publication has a nonzero sequence and stays withdrawn.
UPDATE "Project" SET "publicationInitialized" = false
WHERE "isPublic" = false AND "publicationSequence" = 0 AND "publishedDocumentId" IS NULL;
