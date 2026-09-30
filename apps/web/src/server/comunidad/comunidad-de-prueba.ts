import { guardarObjeto } from "../almacenamiento";
import { db } from "../db/cliente";
import {
  characterReferences,
  characters,
  consentRecords,
  generationJobs,
  media,
  places,
  projects,
  scenes,
} from "../db/esquema";

/**
 * Datos de prueba de la comunidad para los tests de integración: personajes, medios y trabajos escritos directamente en
 * la base de datos (sin proveedor, sin red, sin créditos). Los bytes de cada medio son únicos para poder comprobar que
 * la copia publicada es idéntica al original. No se usa en producción.
 */

const nombre = (prefijo: string) => `${prefijo} ${crypto.randomUUID().slice(0, 8)}`;

/** Personaje inventado con su declaración vigente (lo que exige la comunidad), salvo que se pida sin ella. */
export async function inventadoDePrueba(
  duenoId: string,
  opciones: { declarado?: boolean; kind?: "persona" | "animal" } = {},
): Promise<string> {
  const [fila] = await db()
    .insert(characters)
    .values({
      ownerId: duenoId,
      name: nombre("Inventado"),
      kind: opciones.kind ?? "persona",
      virtual: true,
      description: "Una ilustradora inventada de pelo verde que explica recetas.",
      state: "listo",
    })
    .returning({ id: characters.id });
  if (!fila) throw new Error("No se ha creado el personaje inventado de prueba.");
  if (opciones.declarado !== false) {
    await db()
      .insert(consentRecords)
      .values({ characterId: fila.id, holderType: "inventado", syntheticDeclared: true, registeredBy: duenoId });
  }
  return fila.id;
}

/** Personaje hecho con fotos reales: una persona (`persona`) o una mascota real (`animal`). */
export async function personajeRealDePrueba(duenoId: string, kind: "persona" | "animal" = "persona"): Promise<string> {
  const [fila] = await db()
    .insert(characters)
    .values({ ownerId: duenoId, name: nombre("Real"), kind, virtual: false, state: "listo" })
    .returning({ id: characters.id });
  if (!fila) throw new Error("No se ha creado el personaje real de prueba.");
  await db()
    .insert(consentRecords)
    .values({ characterId: fila.id, holderType: kind === "animal" ? "animal_propio" : "yo", adultDeclared: true });
  return fila.id;
}

/** Medio con bytes únicos en el almacenamiento. Por sí solo es una «subida directa». */
export async function medioDePrueba(
  duenoId: string,
  kind: "imagen" | "video" | "audio" = "video",
): Promise<{ id: string; clave: string; bytes: Uint8Array<ArrayBuffer> }> {
  const tipo = kind === "imagen" ? "image/png" : kind === "video" ? "video/mp4" : "audio/mpeg";
  const clave = `pruebas/comunidad/${crypto.randomUUID()}`;
  const bytes = new TextEncoder().encode(`${clave}-${"x".repeat(200)}`);
  await guardarObjeto(clave, bytes, tipo);
  const [fila] = await db()
    .insert(media)
    .values({
      ownerId: duenoId,
      kind,
      storageKey: clave,
      originalName: `m.${kind}`,
      mimeType: tipo,
      sizeBytes: bytes.length,
      width: 720,
      height: 1280,
      title: nombre("Archivo"),
    })
    .returning({ id: media.id });
  if (!fila) throw new Error("No se ha creado el medio de prueba.");
  return { id: fila.id, clave, bytes };
}

export interface OpcionesTrabajo {
  personajeId: string | null;
  resultado?: string;
  origen?: string;
  escenaId?: string;
  input?: Record<string, unknown>;
  productAction?: string;
  lugarId?: string | null;
  lugarVersion?: number | null;
  plantillaId?: string;
  prompt?: string;
  model?: string;
}

/** Trabajo terminado escrito a mano: no llega a ningún proveedor. */
export async function trabajoDePrueba(duenoId: string, o: OpcionesTrabajo): Promise<string> {
  const [fila] = await db()
    .insert(generationJobs)
    .values({
      userId: duenoId,
      kind: "animacion",
      provider: "kie",
      model: o.model ?? "modelo-de-prueba",
      prompt: o.prompt ?? "prompt de prueba",
      input: o.input ?? {},
      estimatedCredits: 0,
      state: "listo",
      characterId: o.personajeId,
      resultMediaId: o.resultado ?? null,
      sourceMediaId: o.origen ?? null,
      sceneId: o.escenaId ?? null,
      productAction: o.productAction ?? "",
      placeId: o.lugarId ?? null,
      placeVersion: o.lugarVersion ?? null,
      promptTemplateId: o.plantillaId ?? null,
    })
    .returning({ id: generationJobs.id });
  if (!fila) throw new Error("No se ha creado el trabajo de prueba.");
  return fila.id;
}

/** Clip generado por un personaje (resultado de un trabajo suyo). */
export async function clipDePrueba(duenoId: string, personajeId: string, extra: Partial<OpcionesTrabajo> = {}) {
  const medio = await medioDePrueba(duenoId, "video");
  await trabajoDePrueba(duenoId, { personajeId, resultado: medio.id, ...extra });
  return medio;
}

/** Vista generada del personaje: resultado de un trabajo suyo y referencia `vista_generada`. */
export async function vistaGeneradaDePrueba(duenoId: string, personajeId: string) {
  const medio = await medioDePrueba(duenoId, "imagen");
  await trabajoDePrueba(duenoId, { personajeId, resultado: medio.id });
  await db()
    .insert(characterReferences)
    .values({ characterId: personajeId, mediaId: medio.id, origin: "vista_generada" });
  return medio;
}

export async function lugarDePrueba(duenoId: string, origin: "fotos" | "generado"): Promise<string> {
  const [fila] = await db()
    .insert(places)
    .values({ ownerId: duenoId, name: nombre("Lugar"), origin })
    .returning({ id: places.id });
  if (!fila) throw new Error("No se ha creado el lugar de prueba.");
  return fila.id;
}

/** Escena de un proyecto propio, con los campos que se pidan. */
export async function escenaDePrueba(duenoId: string, valores: Partial<typeof scenes.$inferInsert> = {}) {
  const [proyecto] = await db()
    .insert(projects)
    .values({ userId: duenoId, title: nombre("Proyecto"), clipSeconds: 8 })
    .returning({ id: projects.id });
  const [escena] = await db()
    .insert(scenes)
    .values({ projectId: proyecto?.id ?? "", sortOrder: 1, ...valores })
    .returning({ id: scenes.id });
  if (!proyecto || !escena) throw new Error("No se ha creado la escena de prueba.");
  return { proyectoId: proyecto.id, escenaId: escena.id };
}
