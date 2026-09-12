import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "@prisma/client";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { keepAdministrator } from "./service";
describe("last active platform administrator", () => {
  it("prevents losing the last active administrator and counts only other active admins", async () => {
    const count = vi.fn().mockResolvedValue(0),
      tx = { user: { count } } as unknown as Prisma.TransactionClient;
    await expect(
      keepAdministrator(tx, { id: "last", role: "admin", status: "active" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(count).toHaveBeenCalledWith({
      where: { id: { not: "last" }, role: "admin", status: "active" },
    });
  });
  it("allows changes when another active admin remains", async () => {
    const tx = {
      user: { count: vi.fn().mockResolvedValue(1) },
    } as unknown as Prisma.TransactionClient;
    await expect(
      keepAdministrator(tx, { id: "target", role: "admin", status: "active" }),
    ).resolves.toBeUndefined();
  });
});
