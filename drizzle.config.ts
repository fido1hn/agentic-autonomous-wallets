import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "src/db/drizzle_migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.AEGIS_DB_PATH ?? "./data/aegis.db",
  },
});
