import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Mismo `.env` de la raíz del monorepo que usan Docker Compose y Next.
loadEnvConfig(path.resolve(import.meta.dirname, "../.."), true, console, true);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/esquema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
});
