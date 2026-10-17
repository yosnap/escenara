import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { PersonajeVista } from "@/lib/personajes";

/**
 * Alta de personajes y su consentimiento contra el PostgreSQL local, sin ningún proveedor:
 *
 * - la mayoría de edad se exige a una persona y no a un animal, y no se esquiva eligiendo «un animal mío»;
 * - un animal registrado sin esa declaración no pasa a persona sin registrar un consentimiento nuevo;
 * - un inventado recién creado dice que le faltan retratos y vistas, no fotos;
 * - un nombre repetido explica la causa, qué hacer y que no se ha creado nada.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);
const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_alta_consentimiento");
}

const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaPersonaje = await import("@/app/api/personajes/[id]/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const rutaInventados = await import("@/app/api/personajes/inventados/route");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { consentEvidence } = await import("../db/esquema");
const { archivarPruebasDeCuenta } = await import("../datos/retencion");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe.skipIf(!hayBaseDeDatos)("alta de personajes y consentimiento", () => {
  let ana: Sesion;

  beforeAll(async () => {
    await aplicarMigraciones();
    ana = await crearSesionDePrueba("user");
  });

  afterAll(async () => {
    await ana?.borrar();
  });

  /** Petición desde la propia aplicación: las rutas que cambian datos exigen `Origin` del mismo sitio. */
  const pedir = (url: string, metodo: string, cuerpo?: unknown) =>
    new Request(`http://localhost${url}`, {
      method: metodo,
      headers: { cookie: ana.cookie, origin: "http://localhost", "Content-Type": "application/json" },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    });

  const nuevo = async (nombre: string, tipo: "persona" | "animal"): Promise<PersonajeVista> => {
    const respuesta = await rutaPersonajes.POST(pedir("/api/personajes", "POST", { nombre, tipo }), undefined);
    expect(respuesta.status).toBe(201);
    return (await respuesta.json()) as PersonajeVista;
  };

  const registrar = (id: string, cuerpo: Record<string, unknown>) =>
    rutaConsentimiento.POST(pedir(`/api/personajes/${id}/consentimiento`, "POST", cuerpo), ctx(id));

  test("un animal propio registra su consentimiento sin declarar mayoría de edad", async () => {
    const lupo = await nuevo("Lupo", "animal");
    const respuesta = await registrar(lupo.id, { titular: "animal_propio", mayoriaDeEdad: false });
    expect(respuesta.status).toBe(200);
    const registrado = (await respuesta.json()) as PersonajeVista;
    expect(registrado.consentimiento?.titular).toBe("animal_propio");
    // No se guarda como declarada: nadie ha declarado la edad de una persona que no aparece.
    expect(registrado.consentimiento?.mayoriaDeEdad).toBe(false);
  });

  test("una persona sigue necesitando la declaración, también si se registra como «un animal mío»", async () => {
    const persona = await nuevo("Sin edad declarada", "persona");
    for (const titular of ["yo", "animal_propio"]) {
      const respuesta = await registrar(persona.id, { titular, mayoriaDeEdad: false });
      expect(respuesta.status).toBe(400);
      expect(((await respuesta.json()) as { error: string }).error).toContain("mayor de edad");
    }
  });

  test("un animal sin declaración de edad no pasa a persona sin registrar un consentimiento nuevo", async () => {
    const gato = await nuevo("Misi", "animal");
    expect((await registrar(gato.id, { titular: "animal_propio", mayoriaDeEdad: false })).status).toBe(200);
    const cambio = await rutaPersonaje.PATCH(
      pedir(`/api/personajes/${gato.id}`, "PATCH", { tipo: "persona" }),
      ctx(gato.id),
    );
    expect(cambio.status).toBe(409);
    expect(((await cambio.json()) as { error: string }).error).toContain(
      "revoca su consentimiento, cambia su tipo a persona y registra un consentimiento nuevo como persona",
    );

    // Los pasos que da el mensaje funcionan, en ese orden.
    const revocado = await rutaConsentimiento.DELETE(
      pedir(`/api/personajes/${gato.id}/consentimiento`, "DELETE", { motivo: "Es una persona" }),
      ctx(gato.id),
    );
    expect(revocado.status).toBe(200);
    const persona = await rutaPersonaje.PATCH(
      pedir(`/api/personajes/${gato.id}`, "PATCH", { tipo: "persona" }),
      ctx(gato.id),
    );
    expect(persona.status).toBe(200);
    expect(((await persona.json()) as PersonajeVista).puedeGenerar).toBe(false);
    const declarado = await registrar(gato.id, { titular: "yo", mayoriaDeEdad: true });
    expect(declarado.status).toBe(200);
    const final = (await declarado.json()) as PersonajeVista;
    expect(final.tipo).toBe("persona");
    expect(final.consentimiento?.mayoriaDeEdad).toBe(true);
  });

  test("un inventado recién creado dice que le faltan retratos y vistas, no fotos", async () => {
    const respuesta = await rutaInventados.POST(
      pedir("/api/personajes/inventados", "POST", {
        nombre: "Nube",
        descripcion: "Mujer de unos treinta años, pelo corto castaño y chaqueta vaquera.",
        declaracion: true,
      }),
      undefined,
    );
    expect(respuesta.status).toBe(201);
    const nube = (await respuesta.json()) as PersonajeVista;
    expect(nube.inventado).toBe(true);
    const motivos = nube.impedimentos.join(" ");
    expect(motivos).not.toContain("foto");
    expect(motivos).toContain("entre su retrato elegido y sus vistas generadas");
  });

  test("un inventado con un nombre que ya existe explica la causa y qué hacer, y no crea nada", async () => {
    await nuevo("Brisa", "persona");
    const respuesta = await rutaInventados.POST(
      pedir("/api/personajes/inventados", "POST", {
        nombre: "Brisa",
        descripcion: "Mujer de unos treinta años, pelo largo rizado y abrigo verde.",
        declaracion: true,
      }),
      undefined,
    );
    expect(respuesta.status).toBe(409);
    const { error } = (await respuesta.json()) as { error: string };
    expect(error).toContain("Ya tienes un personaje llamado «Brisa»");
    expect(error).toContain("Ponle otro nombre");
    expect(error).toContain("No se ha creado nada.");
    const lista = await rutaPersonajes.GET(pedir("/api/personajes", "GET"), undefined);
    const personajes = (await lista.json()) as PersonajeVista[];
    expect(personajes.filter((p) => p.nombre === "Brisa")).toHaveLength(1);
  });

  test("la prueba archivada de un animal no dice que se declarara menor de edad", async () => {
    const perro = await nuevo("Toby", "animal");
    expect((await registrar(perro.id, { titular: "animal_propio", mayoriaDeEdad: false })).status).toBe(200);
    const persona = await nuevo("Con edad declarada", "persona");
    expect((await registrar(persona.id, { titular: "yo", mayoriaDeEdad: true })).status).toBe(200);
    const antes = (await db().select({ id: consentEvidence.id }).from(consentEvidence)).map((f) => f.id);
    await archivarPruebasDeCuenta(db(), ana.id);
    const nuevas = (await db().select().from(consentEvidence)).filter((f) => !antes.includes(f.id));
    const deAnimal = nuevas.filter((f) => f.scope.startsWith("animal_propio:"));
    expect(deAnimal.length).toBeGreaterThan(0);
    // En un animal no se aplica: no se escribe `false`, que se leería como «declarado menor».
    for (const prueba of deAnimal) expect(prueba.declared).not.toHaveProperty("mayorDeEdad");
    const dePersona = nuevas.filter((f) => f.scope.startsWith("yo:"));
    expect(dePersona.some((f) => f.declared.mayorDeEdad === true)).toBe(true);
  });
});
