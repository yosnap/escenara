import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Carga el `.env` de la raíz del monorepo, compartido con Docker Compose.
loadEnvConfig(path.resolve(import.meta.dirname, "../.."), process.env.NODE_ENV !== "production", console, true);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // El historial de versiones del admin lee el changelog de la raíz del monorepo.
  outputFileTracingIncludes: { "/admin/versiones": ["../../docs/CHANGELOG.md"] },
  // Páginas con datos de cuenta: que ningún proxy o CDN las guarde.
  async headers() {
    const privado = [{ key: "Cache-Control", value: "private, no-store" }];
    return [
      { source: "/cuenta", headers: privado },
      { source: "/admin/:ruta*", headers: privado },
    ];
  },
};

export default nextConfig;
