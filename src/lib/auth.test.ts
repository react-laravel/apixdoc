import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextAuthConfig } from "next-auth";
const state = vi.hoisted(() => ({
  config: null as NextAuthConfig | null,
  user: vi.fn(),
}));
vi.mock("next-auth", () => ({
  default: (config: NextAuthConfig) => {
    state.config = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));
vi.mock("./prisma", () => ({ prisma: { user: { findUnique: state.user } } }));
import "./auth";
beforeEach(() => state.user.mockReset());
const refresh = async (token: { id?: string; role?: string }) => {
  const callback = state.config!.callbacks!.jwt!;
  return callback({
    token,
    account: null,
    user: undefined,
  } as unknown as Parameters<typeof callback>[0]);
};
describe("live session identity", () => {
  it("revokes an existing signed session after its account is deleted", async () => {
    state.user.mockResolvedValue(null);
    expect(await refresh({ id: "deleted", role: "admin" })).toBeNull();
  });
  it("does not retain cached administrator privileges after demotion", async () => {
    state.user.mockResolvedValue({
      id: "user",
      name: "Updated",
      email: "new@example.test",
      role: "user",
    });
    expect(await refresh({ id: "user", role: "admin" })).toEqual(
      expect.objectContaining({
        role: "user",
        name: "Updated",
        email: "new@example.test",
      }),
    );
  });
  it("rejects sessions without a valid account identifier", async () => {
    expect(await refresh({ role: "admin" })).toBeNull();
    expect(state.user).not.toHaveBeenCalled();
  });
});
