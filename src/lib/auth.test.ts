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
const refresh = async (token: {
  id?: string;
  role?: string;
  sessionVersion?: number;
}) => {
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
      status: "active",
      sessionVersion: 0,
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

describe("account state and credential session revocation", () => {
  it.each(["disabled", "deleted"])(
    "rejects existing signed sessions for %s accounts",
    async (status) => {
      state.user.mockResolvedValue({
        id: "user",
        role: "user",
        status,
        sessionVersion: 0,
      });
      expect(await refresh({ id: "user" })).toBeNull();
    },
  );
  it("invalidates all old tokens after a password change and does not revive them after restoration", async () => {
    state.user.mockResolvedValue({
      id: "user",
      name: "Name",
      email: "a@example.test",
      role: "user",
      status: "active",
      sessionVersion: 2,
    });
    expect(await refresh({ id: "user", sessionVersion: 1 })).toBeNull();
    expect(await refresh({ id: "user" })).toBeNull();
    expect(await refresh({ id: "user", sessionVersion: 2 })).toEqual(
      expect.objectContaining({ id: "user", sessionVersion: 2 }),
    );
  });
  it("does not accept a sign-in result verified before its password was changed", async () => {
    state.user.mockResolvedValue({
      id: "user",
      status: "active",
      sessionVersion: 1,
    });
    const callback = state.config!.callbacks!.jwt!;
    expect(
      await callback({
        token: {},
        account: null,
        user: { id: "user", role: "user", sessionVersion: 0 },
      } as unknown as Parameters<typeof callback>[0]),
    ).toBeNull();
  });
});
