import { describe, expect, it } from "vitest";
import { canInviteRole, canManageMember } from "./roles";
import {
  normalizedEmail,
  readInvitationToken,
  invitationHash,
} from "./service";
import { teamBody } from "./errors";
describe("team authority", () => {
  it.each(["member", "viewer", "unknown", undefined])(
    "does not let %s manage any role",
    (role) => {
      for (const target of ["owner", "admin", "member", "viewer"]) {
        expect(canManageMember(role, target)).toBe(false);
        expect(canInviteRole(role, target)).toBe(false);
      }
    },
  );
  it("reserves administrator assignment for owners and ownership for transfers", () => {
    expect(canInviteRole("owner", "admin")).toBe(true);
    expect(canInviteRole("owner", "owner")).toBe(false);
    expect(canInviteRole("admin", "admin")).toBe(false);
    expect(canManageMember("admin", "admin")).toBe(false);
    expect(canManageMember("owner", "owner")).toBe(false);
    expect(canManageMember("admin", "member")).toBe(true);
  });
  it("bounds invitation inputs and hashes tokens deterministically without storing them", () => {
    expect(normalizedEmail("  Person@Example.com ")).toBe("person@example.com");
    for (const value of ["", "x", {}, "a@b\nc.com"])
      expect(() => normalizedEmail(value)).toThrow();
    expect(readInvitationToken("a".repeat(43))).toBe("a".repeat(43));
    expect(invitationHash("a".repeat(43))).toHaveLength(64);
    expect(invitationHash("a".repeat(43))).not.toContain("a".repeat(43));
    for (const value of ["a".repeat(44), "x/y", null])
      expect(() => readInvitationToken(value)).toThrow();
  });
  it("rejects cross-origin writes and non-JSON form submissions", async () => {
    await expect(
      teamBody(
        new Request("http://localhost/api/team", {
          method: "POST",
          headers: {
            origin: "https://other.example",
            "content-type": "application/json",
          },
          body: "{}",
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      teamBody(
        new Request("http://localhost/api/team", {
          method: "POST",
          body: "{}",
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
