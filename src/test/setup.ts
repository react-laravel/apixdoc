import "@testing-library/jest-dom/vitest";

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
      user: { id: "user-1", email: "test@test.com", name: "Test User", role: "admin" },
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
