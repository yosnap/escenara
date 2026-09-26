import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Carga el `.env` de la raíz del monorepo, compartido con Docker Compose.
loadEnvConfig(path.resolve(import.meta.dirname, "../.."), process.env.NODE_ENV !== "production", console, true);

const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;
