import type { Prisma } from "@prisma/client";
import { AUDIT_ACTIONS, AUDIT_FIELDS, type AuditAction } from "./model";
export type AuditActor = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};
interface AuditInput {
  action: AuditAction;
  actor: AuditActor | null;
  organizationId?: string | null;
  projectId?: string | null;
  targetId?: string | null;
  targetName?: string;
  metadata?: Record<string, unknown>;
}
const label = (value: unknown) =>
  typeof value === "string" ? value.slice(0, 160) : "";
/** Metadata is allowlisted. Request bodies, header values, passwords and invitation tokens never enter this index. */
export function auditMetadata(input: Record<string, unknown> = {}): string {
  const result: Record<string, unknown> = {};
  for (const key of [
    "version",
    "affectedCount",
    "importedCount",
    "skippedCount",
    "removedCount",
    "days",
  ]) {
    const value = input[key];
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
      result[key] = value;
  }
  if (Array.isArray(input.fields))
    result.fields = [
      ...new Set(
        input.fields.filter(
          (key): key is string =>
            typeof key === "string" && Object.hasOwn(AUDIT_FIELDS, key),
        ),
      ),
    ].slice(0, 20);
  for (const key of ["role", "previousRole"]) {
    const value = input[key];
    if (
      typeof value === "string" &&
      ["owner", "admin", "member", "viewer", "user"].includes(value)
    )
      result[key] = value;
  }
  if (input.format === "openapi" || input.format === "postman")
    result.format = input.format;
  return JSON.stringify(result);
}
export async function appendAudit(
  tx: Prisma.TransactionClient,
  input: AuditInput,
) {
  if (!Object.hasOwn(AUDIT_ACTIONS, input.action))
    throw new Error("Unknown audit action");
  const project = input.projectId
    ? await tx.project.findUnique({
        where: { id: input.projectId },
        select: { id: true, name: true, organizationId: true },
      })
    : null;
  const organizationId =
    project?.organizationId || input.organizationId || null;
  const organization = organizationId
    ? await tx.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      })
    : null;
  return tx.auditEvent.create({
    data: {
      organizationId,
      organizationName: label(organization?.name),
      projectId: input.projectId || null,
      projectName: label(project?.name),
      actorId: input.actor?.id || null,
      actorName: label(input.actor?.name || input.actor?.email || "系统"),
      action: input.action,
      targetId: input.targetId || null,
      targetName: label(input.targetName),
      metadata: auditMetadata(input.metadata),
    },
  });
}
