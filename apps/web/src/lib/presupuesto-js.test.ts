import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  comprobarPresupuestos,
  entradasDeCliente,
  ficherosDeRuta,
  instruccionesDeAlta,
  leerManifiestoCliente,
  MARGEN_KB,
  META_KB,
  medidasDesfasadas,
  medidoDelMotivo,
  rutaDeClave,
  sumarKb,
  topesSinRuta,
  validarPresupuestos,
} from "./presupuesto-js";

/**
 * Presupuesto de JavaScript por ruta: cómo se mide sobre los manifiestos de Next y que **el build falla** cuando una
 * ruta se pasa de su tope (se ejecuta el script de verdad sobre un build de mentira).
 */

const WEB = path.resolve(import.meta.dir, "../..");
const APP = "/proyecto/apps/web/src/app";

const manifiesto = (clave: string, modulos: Record<string, string[]>) =>
  `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST[${JSON.stringify(clave)}]=${JSON.stringify(
    {
      moduleLoading: { prefix: "/_next/" },
      clientModules: Object.fromEntries(Object.entries(modulos).map(([k, chunks]) => [k, { id: k, chunks }])),
    },
  )};`;

describe("medida de una ruta", () => {
  test("lee el manifiesto sin ejecutarlo y da la ruta sin grupos", () => {
    const { clave, manifiesto: m } = leerManifiestoCliente(manifiesto("/(cuenta)/entrar/page", {}));
    expect(clave).toBe("/(cuenta)/entrar/page");
    expect(m.clientModules).toEqual({});
    expect(rutaDeClave(clave)).toBe("/entrar");
    expect(rutaDeClave("/page")).toBe("/");
    expect(rutaDeClave("/proyectos/[id]/montaje/page")).toBe("/proyectos/[id]/montaje");
    expect(() => leerManifiestoCliente("module.exports = {}")).toThrow();
  });

  test("solo cuentan los componentes que el servidor de la ruta usa, con sus trozos una vez", () => {
    const { manifiesto: m } = leerManifiestoCliente(
      manifiesto("/biblioteca/page", {
        [`${APP}/biblioteca/_componentes/vista-biblioteca.tsx`]: [
          "1-a.js",
          "static/chunks/app/proyectos/%5Bid%5D/x.js",
        ],
        [`${APP}/crear/_componentes/vista-crear.tsx`]: ["9-otra-ruta.js"],
        "/proyecto/node_modules/next/dist/client/app-dir/link.js": ["1-a.js", "2-b.js", "estilo.css"],
      }),
    );
    const servidor = [
      `require("/proyecto/apps/web/src/app/biblioteca/_componentes/vista-biblioteca.tsx")`,
      "next/dist/client/app-dir/link.js",
    ];
    const entradas = entradasDeCliente(m, servidor);
    expect(entradas).toHaveLength(2);
    expect(ficherosDeRuta(["0-comun.js", "polyfill.css"], m, entradas)).toEqual([
      "0-comun.js",
      "1-a.js",
      "2-b.js",
      "static/chunks/app/proyectos/[id]/x.js",
    ]);
    expect(sumarKb(["a", "b"], () => 1536)).toBe(3);
  });

  test("tope por defecto, tope propio con su deuda, ruta sin alta y topes que ya no corresponden a nada", () => {
    const presupuestos = {
      porDefectoKb: META_KB,
      dentroDeLaMeta: ["/", "/cuenta", "/vieja-dentro"],
      rutas: { "/crear": { topeKb: 308, motivo: "Flujo por pasos. Medido: 305 KB." } },
    };
    const medidas = [
      { ruta: "/", ficheros: [], kb: 150 },
      { ruta: "/crear", ficheros: [], kb: 305 },
      { ruta: "/cuenta", ficheros: [], kb: 201 },
      { ruta: "/nueva", ficheros: [], kb: 120 },
    ];
    expect(comprobarPresupuestos(medidas, presupuestos).map((r) => [r.ruta, r.pasa, r.deuda, r.sinAlta])).toEqual([
      ["/crear", true, true, false],
      ["/cuenta", false, false, false],
      ["/", true, false, false],
      // Una pantalla nueva sin alta falla aunque quepa: su peso se mira al crearla.
      ["/nueva", false, false, true],
    ]);
    expect(topesSinRuta(medidas, presupuestos)).toEqual(["/vieja-dentro"]);
    expect(instruccionesDeAlta("/nueva", 120)).toContain("«dentroDeLaMeta»");
    expect(instruccionesDeAlta("/pesada", 240)).toContain('"topeKb": 243');
    expect(instruccionesDeAlta("/pesada", 240)).toContain("exige su justificación");
  });

  test("«Medido» se contrasta con la medida real: si se desfasa más de 1 KB, se avisa", () => {
    const presupuestos = {
      porDefectoKb: META_KB,
      dentroDeLaMeta: [],
      rutas: { "/crear": { topeKb: 308, motivo: "Pasos. Medido: 305 KB." } },
    };
    expect(medidasDesfasadas([{ ruta: "/crear", ficheros: [], kb: 305.8 }], presupuestos)).toEqual([]);
    expect(medidasDesfasadas([{ ruta: "/crear", ficheros: [], kb: 290 }], presupuestos)[0]).toContain(
      "el motivo dice 305 KB y hoy pesa 290 KB",
    );
    expect(medidoDelMotivo("Lo que sea. Medido: 237.8 KB.")).toBe(237.8);
    expect(medidoDelMotivo("Sin medida.")).toBeNull();
  });

  test("el fichero de topes se valida al leerlo y cierra las trampas fáciles", () => {
    const valido = (cambios: object = {}) => ({ porDefectoKb: 200, dentroDeLaMeta: ["/"], rutas: {}, ...cambios });
    expect(() => validarPresupuestos(null)).toThrow();
    expect(() => validarPresupuestos(valido({ porDefectoKb: "200" }))).toThrow();
    // La meta no se sube desde el JSON.
    expect(() => validarPresupuestos(valido({ porDefectoKb: 250 }))).toThrow("la meta del ADR-0039");
    expect(() => validarPresupuestos(valido({ dentroDeLaMeta: undefined }))).toThrow();
    expect(() => validarPresupuestos(valido({ dentroDeLaMeta: ["crear"] }))).toThrow();
    expect(() =>
      validarPresupuestos(valido({ rutas: { crear: { topeKb: 300, motivo: "x. Medido: 299 KB." } } })),
    ).toThrow();
    // Sin «Medido», o con más margen del permitido, no vale.
    expect(() => validarPresupuestos(valido({ rutas: { "/crear": { topeKb: 300, motivo: "Pasos." } } }))).toThrow();
    expect(() =>
      validarPresupuestos(valido({ rutas: { "/crear": { topeKb: 320, motivo: "Pasos. Medido: 305 KB." } } })),
    ).toThrow(`más ${MARGEN_KB} KB de margen`);
    expect(() =>
      validarPresupuestos(valido({ rutas: { "/": { topeKb: 203, motivo: "Portada. Medido: 200 KB." } } })),
    ).toThrow("a la vez");
    expect(
      validarPresupuestos(valido({ rutas: { "/crear": { topeKb: 308, motivo: "Pasos. Medido: 305 KB." } } })),
    ).toEqual({
      porDefectoKb: 200,
      dentroDeLaMeta: ["/"],
      rutas: { "/crear": { topeKb: 308, motivo: "Pasos. Medido: 305 KB." } },
    });
  });

  test("los topes reales del proyecto son válidos y la meta sigue siendo 200 KB", async () => {
    const reales = validarPresupuestos(await Bun.file(path.join(WEB, "presupuesto-js.json")).json());
    expect(reales.porDefectoKb).toBe(META_KB);
    for (const tope of Object.values(reales.rutas)) expect(tope.motivo).toMatch(/Medido: [\d.]+ KB\.$/);
  });
});

describe("el build falla si una ruta se pasa de su tope", () => {
  const carpetas: string[] = [];
  afterAll(async () => {
    for (const c of carpetas) await rm(c, { recursive: true, force: true });
  });

  /** Build mínimo: un fichero común, la portada con un trozo de `kb` KB comprimidos (datos al azar) y su servidor. */
  async function buildDeMentira(kb: number) {
    const dir = await mkdtemp(path.join(tmpdir(), "presupuesto-js-"));
    carpetas.push(dir);
    await mkdir(path.join(dir, "static/chunks"), { recursive: true });
    await mkdir(path.join(dir, "server/app"), { recursive: true });
    await Bun.write(
      path.join(dir, "build-manifest.json"),
      JSON.stringify({ rootMainFiles: ["static/chunks/comun.js"] }),
    );
    await Bun.write(path.join(dir, "static/chunks/comun.js"), "console.log(1)");
    const azar = new Uint8Array(kb * 1024);
    for (let i = 0; i < azar.length; i += 65536) crypto.getRandomValues(azar.subarray(i, i + 65536));
    await Bun.write(path.join(dir, "static/chunks/portada.js"), azar);
    const cabecera = `${APP}/_portada/cabecera.tsx`;
    await Bun.write(
      path.join(dir, "server/app/page_client-reference-manifest.js"),
      manifiesto("/page", { [cabecera]: ["static/chunks/portada.js"] }),
    );
    await Bun.write(path.join(dir, "server/app/page.js"), `createProxy(${JSON.stringify(cabecera)})`);
    return dir;
  }

  const ejecutar = async (dir: string, topes: object) => {
    const fichero = path.join(dir, "topes.json");
    await Bun.write(fichero, JSON.stringify(topes));
    const proceso = Bun.spawn(["bun", path.join(WEB, "scripts/presupuesto-js.ts"), dir, fichero], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [salida, errores] = [await new Response(proceso.stdout).text(), await new Response(proceso.stderr).text()];
    return { codigo: await proceso.exited, salida, errores };
  };

  test("una ruta por encima de 200 KB hace fallar el build y dice cuál y cuánto", async () => {
    const dir = await buildDeMentira(230);
    const r = await ejecutar(dir, { porDefectoKb: 200, dentroDeLaMeta: ["/"], rutas: {} });
    expect(r.codigo).toBe(1);
    expect(r.errores).toMatch(/1 ruta\(s\) superan su presupuesto de JavaScript: \/ \(2\d\d(\.\d)? KB > 200 KB\)/);
  }, 30_000);

  test("con un tope propio por encima, pasa y la tabla lo marca como deuda", async () => {
    const dir = await buildDeMentira(230);
    const r = await ejecutar(dir, {
      porDefectoKb: 200,
      dentroDeLaMeta: [],
      rutas: { "/": { topeKb: 233, motivo: "Prueba. Medido: 230 KB." } },
    });
    expect(r.codigo).toBe(0);
    expect(r.salida).toContain("(deuda: meta 200 KB)");
  }, 30_000);

  test("una pantalla nueva sin dar de alta hace fallar el build con las instrucciones", async () => {
    const dir = await buildDeMentira(20);
    const r = await ejecutar(dir, { porDefectoKb: 200, dentroDeLaMeta: [], rutas: {} });
    expect(r.codigo).toBe(1);
    expect(r.errores).toContain("1 ruta(s) nuevas sin dar de alta");
    expect(r.errores).toContain("Añade «/» a «dentroDeLaMeta»");
  }, 30_000);

  test("PRESUPUESTO_JS_SOLO_AVISO=1 deja seguir el build, pero lo dice", async () => {
    const dir = await buildDeMentira(230);
    const fichero = path.join(dir, "topes.json");
    await Bun.write(fichero, JSON.stringify({ porDefectoKb: 200, dentroDeLaMeta: ["/"], rutas: {} }));
    const proceso = Bun.spawn(["bun", path.join(WEB, "scripts/presupuesto-js.ts"), dir, fichero], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, PRESUPUESTO_JS_SOLO_AVISO: "1" },
    });
    const errores = await new Response(proceso.stderr).text();
    expect(await proceso.exited).toBe(0);
    expect(errores).toContain("superan su presupuesto");
    expect(errores).toContain("el presupuesto NO se cumple");
  }, 30_000);

  test("un build sin páginas no se da por bueno", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "presupuesto-js-"));
    carpetas.push(dir);
    await mkdir(path.join(dir, "server/app"), { recursive: true });
    await Bun.write(path.join(dir, "build-manifest.json"), JSON.stringify({ rootMainFiles: [] }));
    const r = await ejecutar(dir, { porDefectoKb: 200, dentroDeLaMeta: [], rutas: {} });
    expect(r.codigo).toBe(1);
    expect(r.errores).toContain("No se ha encontrado ninguna página");
  }, 30_000);
});
