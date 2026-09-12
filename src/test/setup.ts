import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "test-project-id" }),
  usePathname: () => "/dashboard/projects/test-project-id",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

// Mock next-auth
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "user-1",
        email: "test@test.com",
        name: "Test User",
        role: "admin",
      },
      expires: "2099-01-01",
    },
    status: "authenticated",
  }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock window.confirm
const originalConfirm = window.confirm;
window.confirm = vi.fn(() => true);

// Cleanup
afterEach(() => {
  vi.restoreAllMocks();
  window.confirm = originalConfirm;
});

// jsdom has no layout or native pointer capture; Radix relies on these browser APIs.
const pointerCaptures = new WeakMap<Element, Set<number>>();
Element.prototype.hasPointerCapture ??= function (pointerId: number) {
  return pointerCaptures.get(this)?.has(pointerId) ?? false;
};
Element.prototype.setPointerCapture ??= function (pointerId: number) {
  const captures = pointerCaptures.get(this) ?? new Set<number>();
  captures.add(pointerId);
  pointerCaptures.set(this, captures);
};
Element.prototype.releasePointerCapture ??= function (pointerId: number) {
  pointerCaptures.get(this)?.delete(pointerId);
};
Element.prototype.scrollIntoView ??= function () {};
