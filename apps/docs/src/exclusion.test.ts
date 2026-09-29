import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { buscarFugas } from "./exclusion";

const APP = path.resolve(import.meta.dir, "..");
const DIST = path.join(APP, "dist");

describe("el build de la web de documentación", () => {
  beforeAll(() => {
    const build = Bun.spawnSync(["bun", "run", "astro", "build"], { cwd: APP, stdout: "pipe", stderr: "pipe" });
    if (build.exitCode !== 0) throw new Error(`astro build falló:\n${build.stderr.toString()}`);
  }, 180_000);

  test("no publica nada privado ni con forma de clave", () => {
    expect(buscarFugas(DIST)).toEqual([]);
  });

  test("solo publica la portada, las guías del índice y sus recursos", () => {
    const glob = new Bun.Glob("**/*.html");
    const paginas = [...glob.scanSync(DIST)].sort();
    for (const pagina of paginas) {
      expect(pagina).toMatch(/^(index\.html|404\.html|guias\/[a-z0-9.-]+\/index\.html)$/);
    }
    expect(paginas).toContain("guias/tu-primer-video/index.html");
  });

  test("los enlaces a medios de las guías apuntan a archivos que existen", () => {
    const glob = new Bun.Glob("guias/*/index.html");
    for (const pagina of glob.scanSync(DIST)) {
      const html = readFileSync(path.join(DIST, pagina), "utf8");
      for (const [, ruta = ""] of html.matchAll(/href="(\/medios\/[^"]+)"/g)) {
        expect(existsSync(path.join(DIST, decodeURIComponent(ruta)))).toBe(true);
      }
    }
  });
});

describe("buscarFugas", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "escenara-docs-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  // Los valores se montan en tiempo de ejecución para que el repositorio no contenga nada con forma de clave.
  const claveFalsa = `sk-${"x".repeat(32)}`;

  test("detecta rutas privadas, menciones y claves, también dentro del índice del buscador", () => {
    mkdirSync(path.join(dir, "privado"), { recursive: true });
    writeFileSync(path.join(dir, "privado", "nota.html"), "<p>hola</p>");
    mkdirSync(path.join(dir, "plans"), { recursive: true });
    writeFileSync(path.join(dir, "plans", "fase.html"), "<p>plan</p>");
    writeFileSync(path.join(dir, "pagina.html"), `<p>Mira docs/privado/claves y ${claveFalsa}</p>`);
    writeFileSync(path.join(dir, "fragmento.pf_fragment"), gzipSync(`{"content":"${"AKIA"}${"A".repeat(16)}"}`));
    writeFileSync(path.join(dir, "entorno.js"), `const x = "${"BETTER_AUTH"}_SECRET=${"b".repeat(20)}";`);

    const motivos = buscarFugas(dir).map((f) => `${f.archivo}: ${f.motivo}`);
    expect(motivos).toContain("privado/nota.html: carpeta docs/privado");
    expect(motivos).toContain("plans/fase.html: carpeta plans");
    expect(motivos).toContain("pagina.html: ruta docs/privado/");
    expect(motivos).toContain("pagina.html: clave con prefijo sk-");
    expect(motivos).toContain("fragmento.pf_fragment: clave de acceso de AWS");
    expect(motivos).toContain("entorno.js: variable secreta con valor");
  });

  test("no confunde con claves los textos normales de las guías", () => {
    const limpio = mkdtempSync(path.join(tmpdir(), "escenara-docs-limpio-"));
    writeFileSync(
      path.join(limpio, "guia.html"),
      "<p>La clave empieza por «sk_» y va en ESCENARA_CLAVE_MAESTRA. Cabecera Authorization: Bearer …</p>",
    );
    expect(buscarFugas(limpio)).toEqual([]);
    rmSync(limpio, { recursive: true, force: true });
  });
});
