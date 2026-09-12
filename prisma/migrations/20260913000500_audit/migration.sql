CREATE TABLE "AuditEvent" (
 "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT, "organizationName" TEXT NOT NULL DEFAULT '',
 "projectId" TEXT, "projectName" TEXT NOT NULL DEFAULT '', "actorId" TEXT, "actorName" TEXT NOT NULL,
 "action" TEXT NOT NULL, "targetId" TEXT, "targetName" TEXT NOT NULL DEFAULT '', "metadata" TEXT NOT NULL DEFAULT '{}',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditEvent_organizationId_createdAt_id_idx" ON "AuditEvent"("organizationId", "createdAt", "id");
CREATE INDEX "AuditEvent_projectId_createdAt_id_idx" ON "AuditEvent"("projectId", "createdAt", "id");
CREATE INDEX "AuditEvent_action_createdAt_id_idx" ON "AuditEvent"("action", "createdAt", "id");
CREATE INDEX "AuditEvent_createdAt_id_idx" ON "AuditEvent"("createdAt", "id");
