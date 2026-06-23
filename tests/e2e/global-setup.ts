import { test as setup } from "@playwright/test";

setup.beforeAll(async () => {
  // Ensure the database is seeded before running e2e tests
  // Run: npm run db:seed
});
