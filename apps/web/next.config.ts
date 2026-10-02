import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Carga el `.env` de la raíz del monorepo, compartido con Docker Compose.
loadEnvConfig(path.resolve(import.meta.dirname, "../.."), process.env.NODE_ENV !== "production", console, true);

const nextConfig: NextConfig = {
  // QA aislada puede convivir con el servidor de desarrollo del propietario.
  distDir: process.env.ESCENARA_QA_LOCAL === "1" ? ".next-admin-qa" : ".next",
  poweredByHeader: false,
  // En desarrollo, Next registra cada acción de servidor con sus argumentos: contraseñas y claves de API
  // acabarían en la consola. Ningún secreto debe aparecer en los registros (bóveda, ADR-0005).
  logging: { serverFunctions: false },
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
