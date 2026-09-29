import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const APP = path.resolve(import.meta.dir, "..");
const leer = (f: string) => readFileSync(path.join(APP, f), "utf8");

describe("imagen de la web de documentación", () => {
  test("el Dockerfile solo copia rutas públicas del repositorio", () => {
    const copias = [...leer("Dockerfile").matchAll(/^COPY (?!--from)(.+)$/gm)].map((m) => m[1]?.split(/\s+/)[0]);
    expect(copias).toEqual([
      "package.json",
      "apps/docs/package.json",
      "apps/docs",
      "docs/guias",
      "docs/assets",
      "docs/branding",
      "apps/docs/nginx.conf",
    ]);
  });

  test("el filtro del contexto parte de excluirlo todo y veta lo privado", () => {
    const filtro = leer("Dockerfile.dockerignore").split("\n");
    expect(filtro.find((l) => l.trim() && !l.startsWith("#"))).toBe("*");
    for (const privado of ["docs/privado/", "datos-privados/", "plans/", "**/.env"]) expect(filtro).toContain(privado);
  });

  test("nginx escucha en 8080 y expone la comprobación de salud", () => {
    const conf = leer("nginx.conf");
    expect(conf).toContain("listen 8080;");
    expect(conf).toMatch(/location = \/salud \{[^}]*return 200/);
    expect(leer("Dockerfile")).toContain("http://127.0.0.1:8080/salud");
  });
});
