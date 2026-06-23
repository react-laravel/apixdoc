import { test as base } from "@playwright/test";

type PageFixtures = {
  adminUser: { email: string; password: string };
};

export const test = base.extend<PageFixtures>({
  adminUser: async ({}, use) => {
    // Default test credentials — adjust to match your seed data
    await use({
      email: process.env.E2E_ADMIN_EMAIL ?? "admin@apixdocs.com",
      password: process.env.E2E_ADMIN_PASSWORD ?? "password",
    });
  },
});

export { expect } from "@playwright/test";
