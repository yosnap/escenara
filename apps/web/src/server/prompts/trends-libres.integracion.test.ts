import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * Trends sin duración fija y que deciden la dirección, contra PostgreSQL.
 *
 * Lo que fija, con datos de antes de la versión:
 *
 * - la migración de datos libera la duración de los trends de la instalación creando **versión nueva con motivo**,
 *   deja intacta la anterior, no toca las variantes de 5 s, los caducados ni los de un usuario, y es idempotente;
 * - un trabajo ya generado no cambia (su prompt y la versión que cita);
 * - una escena con trend y la duración del proyecto que ya tenía sigue siendo válida: cita la versión nueva y se puede
 *   volver a guardar con su trend;
 * - un trend que limita la duración rechaza la del proyecto con su causa;
 * - el admin valida los dos campos nuevos con su causa, y cambiarlos crea versión con motivo.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_trends_libres");
}

const { and, asc, eq, inArray } = await import("drizzle-orm");
const { sql } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { generationJobs, projects, promptTemplates, promptTemplateVersions, scenes } = await import("../db/esquema");
const { editarEscena } = await import("../asistente/escenas");
const { ErrorProyecto } = await import("../asistente/errores");
const { crearPlantillaDeLaInstalacion, editarPlantillaDeLaInstalacion } = await import("./plantillas-admin");
const { ErrorPreset } = await import("./errores");
const { componerDesdePlantilla } = await import("./render");
const { elegirModelo } = await import("../proveedores/catalogo");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;

const MIGRACION = readFileSync(
  path.resolve(import.meta.dirname, "../../../drizzle/0053_trends-sin-duracion-fija.sql"),
  "utf8",
);
const aplicarMigracionDeDatos = () => db().execute(sql.raw(MIGRACION));

/** Texto sembrado del unboxing: con él la migración sabe qué decide el trend. */
const TEXTO_UNBOXING =
  "First-person unboxing in one continuous close shot. Hands open the package and reveal the object naturally. Scene detail: {{escena}}. Keep the object physically inside the scene throughout.";
const VARIABLES = JSON.stringify([{ nombre: "escena", tipo: "texto", etiqueta: "Escena", obligatoria: true }]);

describe.skipIf(!hayBaseDeDatos)("trends sin duración fija", () => {
  let admin: Sesion;
  let ana: Sesion;
  const prefijo = `tl-${crypto.randomUUID().slice(0, 6)}`;
  const claves: string[] = [];

  /** Crea un trend **tal como estaba antes de la versión**: con la duración que exigía y su versión 1. */
  async function trendAntiguo(datos: {
    sufijo: string;
    segundos: number;
    texto?: string;
    estado?: "vigente" | "revision" | "caducada";
    dueno?: string | null;
  }) {
    const slug = `${prefijo}-${datos.sufijo}`;
    claves.push(slug);
    const texto = datos.texto ?? TEXTO_UNBOXING;
    const permitidas = JSON.stringify([datos.segundos]);
    const [fila] = await db()
      .insert(promptTemplates)
      .values({
        ownerId: datos.dueno ?? null,
        slug,
        name: `Trend ${datos.sufijo}`,
        kind: "trend",
        trendStatus: datos.estado ?? "vigente",
        targetSeconds: datos.segundos,
        allowedSeconds: permitidas,
        capability: "image_to_video",
        template: texto,
        variables: VARIABLES,
        version: 1,
      })
      .returning();
    if (!fila) throw new Error("No se ha creado el trend de prueba.");
    const [version] = await db()
      .insert(promptTemplateVersions)
      .values({
        templateId: fila.id,
        number: 1,
        template: texto,
        variables: VARIABLES,
        allowedSeconds: permitidas,
        changeReason: "Alta.",
      })
      .returning();
    if (!version) throw new Error("No se ha creado la versión de prueba.");
    return { fila, version };
  }

  const versionesDe = (id: string) =>
    db()
      .select()
      .from(promptTemplateVersions)
      .where(eq(promptTemplateVersions.templateId, id))
      .orderBy(asc(promptTemplateVersions.number));
  const filaDe = async (id: string) => {
    const [fila] = await db().select().from(promptTemplates).where(eq(promptTemplates.id, id));
    if (!fila) throw new Error("No existe la plantilla.");
    return fila;
  };

  beforeAll(async () => {
    await aplicarMigraciones();
    admin = await crearSesionDePrueba("admin");
    ana = await crearSesionDePrueba("user");
  });

  afterAll(async () => {
    if (claves.length > 0) await db().delete(promptTemplates).where(inArray(promptTemplates.slug, claves));
    await Promise.all([admin?.borrar(), ana?.borrar()]);
  });

  test("la migración libera la duración con versión nueva, conserva lo anterior y es idempotente", async () => {
    const libre = await trendAntiguo({ sufijo: "unboxing", segundos: 8 });
    const editado = await trendAntiguo({ sufijo: "editado", segundos: 6, texto: "A hand-made trend. {{escena}}." });
    const variante = await trendAntiguo({ sufijo: "unboxing-5s", segundos: 5 });
    const caducado = await trendAntiguo({ sufijo: "caducado", segundos: 8, estado: "caducada" });
    const deUsuario = await trendAntiguo({ sufijo: "de-ana", segundos: 8, dueno: ana.id });

    // Un trabajo ya generado con la versión 1, y una escena de un proyecto de 8 s que la cita.
    const [trabajo] = await db()
      .insert(generationJobs)
      .values({
        userId: ana.id,
        kind: "animacion",
        provider: "kie",
        model: "modelo-antiguo",
        prompt: "Prompt final ya enviado.",
        estimatedCredits: 40,
        input: { plantilla: { id: libre.fila.id, versionId: libre.version.id, kind: "trend" } },
      })
      .returning();
    const [proyecto] = await db()
      .insert(projects)
      .values({ userId: ana.id, title: "Proyecto con trend", clipSeconds: 8 })
      .returning();
    const [escena] = await db()
      .insert(scenes)
      .values({ projectId: proyecto?.id ?? "", sortOrder: 1, templateId: libre.fila.id, templateVersion: 1 })
      .returning();
    if (!trabajo || !escena) throw new Error("No se han creado el trabajo ni la escena de prueba.");

    await aplicarMigracionDeDatos();

    // El trend de la instalación: versión 2 con motivo, cualquier duración y lo que dicta su texto.
    const tras = await filaDe(libre.fila.id);
    expect(tras.version).toBe(2);
    expect(tras.allowedSeconds).toBe("[]");
    expect(tras.decidedDirection).toBe('["plano","angulo","camara"]');
    expect(tras.targetSeconds).toBe(8);
    const versiones = await versionesDe(libre.fila.id);
    expect(versiones.map((v) => v.number)).toEqual([1, 2]);
    // La anterior queda intacta: es la que cita el trabajo.
    expect(versiones[0]).toEqual(libre.version);
    expect(versiones[1]?.template).toBe(TEXTO_UNBOXING);
    expect(versiones[1]?.allowedSeconds).toBe("[]");
    expect(versiones[1]?.changeReason).toContain("Duración libre");

    // Un texto que no sembró Escenara: se libera la duración, pero no se bloquea nada de la dirección.
    const trasEditado = await filaDe(editado.fila.id);
    expect(trasEditado.allowedSeconds).toBe("[]");
    expect(trasEditado.decidedDirection).toBe("[]");

    // Variante de 5 s, caducado y de un usuario: tal cual.
    for (const intacto of [variante, caducado, deUsuario]) {
      expect(await filaDe(intacto.fila.id)).toEqual(intacto.fila);
      expect(await versionesDe(intacto.fila.id)).toEqual([intacto.version]);
    }

    // El trabajo antiguo no cambia; la escena cita la versión nueva y sigue siendo válida.
    const [trabajoTras] = await db().select().from(generationJobs).where(eq(generationJobs.id, trabajo.id));
    expect(trabajoTras).toEqual(trabajo);
    const [escenaTras] = await db().select().from(scenes).where(eq(scenes.id, escena.id));
    expect(escenaTras?.templateVersion).toBe(2);

    // Volver a pasarla no hace nada.
    await aplicarMigracionDeDatos();
    expect(await filaDe(libre.fila.id)).toEqual(tras);
    expect(await versionesDe(libre.fila.id)).toEqual(versiones);

    // La escena, con la misma duración de proyecto que antes, se vuelve a guardar con su trend.
    const guardada = await editarEscena({ id: ana.id, esAdmin: false }, escena.id, { trendId: libre.fila.id });
    expect(guardada.templateId).toBe(libre.fila.id);
    expect(guardada.templateVersion).toBe(2);
    // Y el proyecto podría ir a otra duración: el trend ya no la limita.
    await db()
      .update(projects)
      .set({ clipSeconds: 5 })
      .where(eq(projects.id, proyecto?.id ?? ""));
    const aCinco = await editarEscena({ id: ana.id, esAdmin: false }, escena.id, { trendId: libre.fila.id });
    expect(aCinco.templateId).toBe(libre.fila.id);
    await db()
      .delete(projects)
      .where(eq(projects.id, proyecto?.id ?? ""));
  });

  test("un trend que limita la duración rechaza la del proyecto con su causa y no guarda nada", async () => {
    const limitado = await trendAntiguo({ sufijo: "limitado", segundos: 5 });
    const [proyecto] = await db()
      .insert(projects)
      .values({ userId: ana.id, title: "De 8 s", clipSeconds: 8 })
      .returning();
    const [escena] = await db()
      .insert(scenes)
      .values({ projectId: proyecto?.id ?? "", sortOrder: 1 })
      .returning();
    try {
      const error = await editarEscena({ id: ana.id, esAdmin: false }, escena?.id, {
        trendId: limitado.fila.id,
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ErrorProyecto);
      expect((error as Error).message).toContain("solo admite clips de 5 s");
      expect((error as Error).message).toContain("el proyecto está configurado a 8 s");
      const [sinCambios] = await db()
        .select()
        .from(scenes)
        .where(eq(scenes.id, escena?.id ?? ""));
      expect(sinCambios?.templateId).toBeNull();
    } finally {
      await db()
        .delete(projects)
        .where(eq(projects.id, proyecto?.id ?? ""));
    }
  });

  test("el admin valida duraciones y dirección con su causa, y cambiarlas crea versión con motivo", async () => {
    const clave = `${prefijo}-admin`;
    claves.push(clave);
    const datos = {
      clave,
      nombre: "Trend del admin",
      descripcion: "Un formato de prueba.",
      capacidad: "image_to_video" as const,
      plantilla: "A close shot of hands: {{escena}}.",
      variables: [{ nombre: "escena", tipo: "texto" as const, etiqueta: "Escena", obligatoria: true }],
      restricciones: { modelos: [], minimoReferencias: 0 },
      activa: true,
      kind: "trend" as const,
      trendStatus: "revision" as const,
    };
    const mal = (extra: Record<string, unknown>) =>
      crearPlantillaDeLaInstalacion({ ...datos, ...extra }, admin.id).catch((e: unknown) => e);

    const duracionMala = await mal({ duracionesAdmitidas: [5, 0] });
    expect(duracionMala).toBeInstanceOf(ErrorPreset);
    expect((duracionMala as Error).message).toContain("«0» no es una duración válida");
    const noLista = await mal({ duracionesAdmitidas: "5" });
    expect((noLista as Error).message).toContain("lista de segundos");
    const categoriaMala = await mal({ direccionDecidida: ["plano", "luz"] });
    expect((categoriaMala as Error).message).toContain("«luz» no es algo que un trend pueda decidir");
    // Nada de eso ha creado la plantilla.
    expect(await db().select().from(promptTemplates).where(eq(promptTemplates.slug, clave))).toEqual([]);

    // Sin los campos nuevos nace sin límite de duración y sin decidir nada, como cualquier trend nuevo.
    const creada = await crearPlantillaDeLaInstalacion(datos, admin.id);
    expect(creada.duracionesAdmitidas).toEqual([]);
    expect(creada.direccionDecidida).toEqual([]);
    expect(creada.targetSeconds).toBeNull();

    // Cambiar lo que dicta el trend sin motivo no se guarda; con motivo, versión nueva con sus valores.
    const cambio = { ...datos, duracionesAdmitidas: [8, 5, 8], direccionDecidida: ["camara", "plano"] };
    const sinMotivo = await editarPlantillaDeLaInstalacion(creada.id, cambio, admin.id).catch((e: unknown) => e);
    expect((sinMotivo as Error).message).toContain("El motivo del cambio");
    const editada = await editarPlantillaDeLaInstalacion(
      creada.id,
      { ...cambio, motivo: "Solo cabe en 5 y 8 s y dicta el plano." },
      admin.id,
    );
    expect(editada.version).toBe(2);
    expect(editada.duracionesAdmitidas).toEqual([5, 8]);
    expect(editada.direccionDecidida).toEqual(["plano", "camara"]);
    const [ultima] = (await versionesDe(creada.id)).slice(-1);
    expect(ultima?.allowedSeconds).toBe("[5,8]");
    expect(ultima?.decidedDirection).toBe('["plano","camara"]');
    expect(ultima?.changeReason).toBe("Solo cabe en 5 y 8 s y dicta el plano.");

    // Un cliente que no manda los campos nuevos no los borra, y solo cambiar el nombre no versiona.
    const renombrada = await editarPlantillaDeLaInstalacion(creada.id, { ...datos, nombre: "Otro nombre" }, admin.id);
    expect(renombrada.version).toBe(2);
    expect(renombrada.duracionesAdmitidas).toEqual([5, 8]);
    expect(renombrada.direccionDecidida).toEqual(["plano", "camara"]);
    const filas = await db()
      .select({ n: promptTemplateVersions.number })
      .from(promptTemplateVersions)
      .where(and(eq(promptTemplateVersions.templateId, creada.id)));
    expect(filas).toHaveLength(2);
  });

  test("el prompt de un trend libre se compone con cualquier duración; uno limitado, solo con las suyas", async () => {
    const modelo = await elegirModelo("image_to_video");
    const libre = await trendAntiguo({ sufijo: "compone-libre", segundos: 8 });
    await aplicarMigracionDeDatos();
    const componer = (plantillaId: string, segundos: number) =>
      componerDesdePlantilla({
        usuarioId: ana.id,
        plantillaId,
        tipo: "animacion",
        presets: {},
        escena: "a kitchen counter",
        tipoPersonaje: null,
        modelo,
        segundos,
      });
    for (const segundos of [4, 11]) {
      const compuesto = await componer(libre.fila.id, segundos);
      expect(compuesto.trend).toEqual({
        permiteHabla: false,
        duracionesAdmitidas: [],
        decide: ["plano", "angulo", "camara"],
      });
      expect(compuesto.versionNumero).toBe(2);
    }
    // Una variante que sigue limitada a 5 s rechaza otra duración con su causa.
    const variante = await trendAntiguo({ sufijo: "compone-5s", segundos: 5 });
    const error = await componer(variante.fila.id, 8).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorPreset);
    expect((error as Error).message).toContain("solo admite clips de 5 s y has pedido 8 s");
    expect((await componer(variante.fila.id, 5)).trend?.duracionesAdmitidas).toEqual([5]);
  });
});
