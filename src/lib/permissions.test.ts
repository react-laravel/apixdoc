import { describe, expect, it, vi } from "vitest";
import { projectPermissions } from "./permissions";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
describe("project role permissions", () => {
  it.each(["owner", "admin"])(
    "allows %s to manage publication and data",
    (role) => {
      expect(projectPermissions(role)).toEqual({
        canRead: true,
        canEdit: true,
        canConfigure: true,
        canReadConfiguration: true,
        canManage: true,
      });
    },
  );
  it("lets editors maintain content and runtime settings without publishing or deleting projects", () => {
    expect(projectPermissions("member")).toMatchObject({
      canRead: true,
      canEdit: true,
      canConfigure: true,
      canManage: false,
    });
  });
  it("keeps viewers read-only and excludes runtime credentials", () => {
    expect(projectPermissions("viewer")).toEqual({
      canRead: true,
      canEdit: false,
      canConfigure: false,
      canReadConfiguration: false,
      canManage: false,
    });
  });
  it("allows anonymous public documentation without granting workspace privileges", () => {
    expect(projectPermissions(null, true)).toEqual({
      canRead: true,
      canEdit: false,
      canConfigure: false,
      canReadConfiguration: false,
      canManage: false,
    });
    expect(projectPermissions(null, false).canRead).toBe(false);
  });
  it("does not promote unknown roles", () => {
    expect(projectPermissions("administrator").canEdit).toBe(false);
  });
});
