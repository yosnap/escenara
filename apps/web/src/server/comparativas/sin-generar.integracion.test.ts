import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import { alcanceDe, alcanceDePagina, PROHIBIDOS_SIN_COSTE, tieneImportacionesOpacas } from "./grafo-de-importaciones";

/**
 * **Comparar sin generar** tiene coste cero por diseño, y aquí se comprueba de dos maneras que se complementan:
 *
 * 1. **Por construcción**: ni el módulo ni la página importan, ni directa ni indirectamente, ningún adaptador de
 *    proveedor, ni la cola, ni el servicio de generación, ni la estimación que consulta saldos. Si alguien los añade,
 *    este test falla antes de que llegue a producción.
 * 2. **Al ejecutarla**: con `fetch` sustituido por uno que cuenta y revienta, la comparativa entera se calcula sin una
 *    sola llamada de red.
 *
 * Y además: el historial es solo tuyo, y los ejemplos de la instalación salen con la lista blanca de siempre.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

describe("comparar sin generar no puede llegar a ningún adaptador de pago", () => {
  test.each(["server/comparativas/sin-generar.ts", "app/comparar/page.tsx"])("%s", (inicio) => {
    const alcance = inicio.startsWith("app/") ? alcanceDePagina(inicio) : alcanceDe(inicio);
    expect(alcance.size).toBeGreaterThan(5);
    expect([...alcance].filter((f) => PROHIBIDOS_SIN_COSTE.some((r) => r.test(f)))).toEqual([]);
  });

  test("la página cuenta con los layouts que Next ejecuta sin importarlos", () => {
    expect(alcanceDePagina("app/comparar/page.tsx").has("app/layout.tsx")).toBe(true);
  });

  test("una importación con nombre calculado no se puede seguir y cuenta como prohibida", () => {
    expect(tieneImportacionesOpacas("const m = await import(nombre);")).toBe(true);
    expect(tieneImportacionesOpacas("const m = require(`./${x}`);")).toBe(true);
    expect(tieneImportacionesOpacas('const m = await import("./fijo"); const r = require("./otro");')).toBe(false);
  });

  test("la página usa de verdad el módulo sin coste", () => {
    expect(alcanceDe("app/comparar/page.tsx").has("server/comparativas/sin-generar.ts")).toBe(true);
  });

  test("el candado detecta un adaptador cuando lo hay: la comparativa A/B sí llega a la cola", () => {
    const alcance = [...alcanceDe("server/comparativas/ab.ts")];
    expect(alcance.some((f) => PROHIBIDOS_SIN_COSTE.some((r) => r.test(f)))).toBe(true);
  });
});

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_comparar");
}

const { eq, like } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { characters, generationJobs, models, promptTemplates, users } = await import("../db/esquema");
const { olvidarCatalogo } = await import("../proveedores/catalogo");
const { crearMedio } = await import("../media/servicio");
const { crearPlantillaDeLaInstalacion } = await import("../prompts/plantillas-admin");
const { fijarDemoDePlantilla } = await import("../prompts/plantillas-admin");
const { compararSinGenerar } = await import("./sin-generar");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;

const png = async (color: string) =>
  new File(
    [
      new Uint8Array(
        await sharp({ create: { width: 64, height: 64, channels: 3, background: color } })
          .png()
          .toBuffer(),
      ),
    ],
    "imagen.png",
    { type: "image/png" },
  );

describe.skipIf(!hayBaseDeDatos)("comparar sin generar", () => {
  let ana: Sesion;
  let beto: Sesion;
  let admin: Sesion;
  const fetchOriginal = globalThis.fetch;
  let llamadas = 0;

  beforeAll(async () => {
    await aplicarMigraciones();
    [ana, beto, admin] = await Promise.all([
      crearSesionDePrueba("user"),
      crearSesionDePrueba("user"),
      crearSesionDePrueba("admin"),
    ]);
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });

  afterAll(async () => {
    await db().delete(promptTemplates).where(like(promptTemplates.slug, "comparar-%"));
    for (const s of [ana, beto, admin]) await db().delete(users).where(eq(users.id, s.id));
  });

  /** Un trabajo terminado de `usuario` con `modelo`, con su archivo en la biblioteca. */
  async function trabajo(usuarioId: string, modelo: string, extra: Partial<typeof generationJobs.$inferInsert> = {}) {
    const medio = await crearMedio({ id: usuarioId, esAdmin: false }, await png("#3d6bff"));
    await db()
      .insert(generationJobs)
      .values({
        userId: usuarioId,
        kind: "animacion",
        provider: "kie",
        model: modelo,
        prompt: "PROMPT-INTERNO-QUE-NO-SALE",
        input: {},
        state: "listo",
        resultMediaId: medio.id,
        estimatedCredits: 30,
        consumedCredits: 20,
        finishedAt: new Date(),
        ...extra,
      });
    return medio.id;
  }

  test("se calcula entera sin una sola llamada de red, con tus resultados y solo los tuyos", async () => {
    await trabajo(ana.id, "veo3_fast", { consumedCredits: 10 });
    await trabajo(ana.id, "veo3_fast", { consumedCredits: 30 });
    await trabajo(ana.id, "veo3_fast", { state: "fallido", resultMediaId: null, consumedCredits: null });
    await trabajo(beto.id, "veo3_fast");
    // Las notas del catálogo son internas de quien administra: no salen en la comparativa.
    await db().update(models).set({ notes: "NOTA-INTERNA-DEL-ADMIN" }).where(eq(models.modelId, "veo3_fast"));
    olvidarCatalogo();

    globalThis.fetch = (async () => {
      llamadas++;
      throw new Error("Comparar sin generar no puede hablar con nadie.");
    }) as unknown as typeof fetch;
    const { modelos } = await compararSinGenerar({ id: ana.id, esAdmin: false }, "image_to_video");
    expect(llamadas).toBe(0);

    const veo = modelos.find((m) => m.nombre.toLowerCase().includes("veo") && m.historial.terminados > 0);
    expect(veo?.historial).toMatchObject({ terminados: 2, fallidos: 1, creditosMedios: 20 });
    expect(veo?.historial.recientes).toHaveLength(2);
    expect(veo?.creditos).toBeGreaterThan(0);
    // Ningún prompt ni nada interno viaja en la vista.
    expect(JSON.stringify(modelos)).not.toContain("PROMPT-INTERNO-QUE-NO-SALE");
    expect(JSON.stringify(modelos)).not.toContain("NOTA-INTERNA-DEL-ADMIN");
    // Beto no ve lo de Ana.
    const deBeto = await compararSinGenerar({ id: beto.id, esAdmin: false }, "image_to_video");
    expect(deBeto.modelos.find((m) => m.id === veo?.id)?.historial.terminados).toBe(1);
  });

  test("los ejemplos de la instalación salen con su plantilla y nunca los de una persona real", async () => {
    const [inventado, real] = await db()
      .insert(characters)
      .values([
        { ownerId: admin.id, name: `Inventado ${crypto.randomUUID()}`, kind: "persona", virtual: true },
        { ownerId: admin.id, name: `Real ${crypto.randomUUID()}`, kind: "persona", virtual: false },
      ])
      .returning({ id: characters.id });
    const conInventado = await trabajo(admin.id, "veo3_lite", { characterId: inventado?.id ?? null });
    const conReal = await trabajo(admin.id, "veo3_lite", { characterId: real?.id ?? null });
    const plantilla = async (clave: string) =>
      crearPlantillaDeLaInstalacion(
        {
          clave: `comparar-${clave}-${crypto.randomUUID().slice(0, 6)}`,
          nombre: `Ejemplo ${clave}`,
          descripcion: "Plantilla de prueba.",
          capacidad: "image_edit",
          plantilla: "{{escena}}",
          variables: [{ nombre: "escena", tipo: "texto" as const, etiqueta: "Escena", obligatoria: true }],
          restricciones: { modelos: [], minimoReferencias: 0 },
          activa: true,
        },
        admin.id,
      );
    const buena = await plantilla("inventado");
    await fijarDemoDePlantilla(buena.id, conInventado, admin.id);
    const mala = await plantilla("real");
    // Elegir el de la persona real se rechaza; si alguien lo forzara en la base, tampoco se enseñaría.
    await expect(fijarDemoDePlantilla(mala.id, conReal, admin.id)).rejects.toThrow();
    await db()
      .update(promptTemplates)
      .set({ demoMediaId: conReal, demoSetBy: admin.id })
      .where(eq(promptTemplates.id, mala.id));

    const { modelos } = await compararSinGenerar({ id: ana.id, esAdmin: false }, "image_to_video");
    const lite = modelos.find((m) => m.ejemplos.length > 0);
    expect(lite?.ejemplos.map((e) => e.plantilla)).toEqual(["Ejemplo inventado"]);
    expect(lite?.ejemplos[0]?.demo.url).toContain(`/api/prompts/plantillas/${buena.id}/demo`);
    expect(JSON.stringify(modelos)).not.toContain(conReal);
  });
});
