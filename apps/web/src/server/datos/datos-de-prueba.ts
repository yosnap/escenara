import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../db/cliente";
import { generationJobs, montageExports, montages, projects, scenes, usageLedger } from "../db/esquema";
import { type Actor, crearMedio } from "../media/servicio";

/**
 * Material de prueba de «Tus datos»: un proyecto con escenas, medios **de verdad** en el almacenamiento (el de la
 * instalación de pruebas), trabajos con su resultado y apuntes de gasto. Sin proveedor: los trabajos se escriben ya
 * terminados, como los dejaría el worker.
 */

let semilla = 0;

/** PNG pequeño y distinto en cada llamada (el color cambia), para que cada medio tenga su propia huella. */
export async function pngDePrueba(): Promise<Uint8Array<ArrayBuffer>> {
  semilla++;
  const datos = await sharp({
    create: { width: 96, height: 96, channels: 3, background: { r: semilla % 255, g: 90, b: 140 } },
  })
    .png()
    .toBuffer();
  const copia = new Uint8Array(new ArrayBuffer(datos.byteLength));
  copia.set(datos);
  return copia;
}

export async function medioDePrueba(actor: Actor, nombre: string): Promise<{ id: string; clave: string }> {
  const medio = await crearMedio(actor, new File([await pngDePrueba()], nombre, { type: "image/png" }));
  // Consulta directa: la vista pública del medio no expone su clave de almacenamiento, y aquí es lo que se comprueba.
  const filas = (await db().execute(sql`select storage_key as clave from media where id = ${medio.id}`)) as unknown as {
    clave: string;
  }[];
  const clave = filas[0]?.clave;
  if (!clave) throw new Error("El medio de prueba no tiene clave.");
  return { id: medio.id, clave };
}

export interface ProyectoDePrueba {
  proyectoId: string;
  escenas: string[];
  trabajos: string[];
  /** Medios generados por los trabajos del proyecto (fotogramas y clips). */
  generados: { id: string; clave: string }[];
  /** Vídeo montado del proyecto. */
  montado: { id: string; clave: string };
  /** Foto subida por el usuario y usada como referencia de una escena: no es un derivado. */
  subida: { id: string; clave: string };
}

/** Proyecto de `actor` con dos escenas producidas, un montaje exportado y gasto apuntado. */
export async function proyectoProducido(actor: Actor, opciones: { guion?: string } = {}): Promise<ProyectoDePrueba> {
  const [proyecto] = await db()
    .insert(projects)
    .values({ userId: actor.id, title: `Anuncio de prueba ${crypto.randomUUID().slice(0, 6)}`, idea: "Una idea" })
    .returning({ id: projects.id });
  if (!proyecto) throw new Error("No se ha creado el proyecto de prueba.");
  const subida = await medioDePrueba(actor, "referencia.png");
  const escenas: string[] = [];
  const trabajos: string[] = [];
  const generados: { id: string; clave: string }[] = [];
  for (const orden of [1, 2]) {
    const fotograma = await medioDePrueba(actor, `fotograma-${orden}.png`);
    const clip = await medioDePrueba(actor, `clip-${orden}.png`);
    generados.push(fotograma, clip);
    const [escena] = await db()
      .insert(scenes)
      .values({
        projectId: proyecto.id,
        sortOrder: orden,
        scriptText: opciones.guion ?? `Guion de la escena ${orden}`,
        action: "Sonríe a cámara",
        plannedSeconds: 4,
        state: "aprobada",
        approvedAt: new Date(),
        approvedFrameMediaId: fotograma.id,
        clipMediaId: clip.id,
        referenceImageMediaId: orden === 1 ? subida.id : null,
      })
      .returning({ id: scenes.id });
    if (!escena) throw new Error("No se ha creado la escena de prueba.");
    escenas.push(escena.id);
    for (const [kind, resultado] of [
      ["fotograma", fotograma.id],
      ["animacion", clip.id],
    ] as const) {
      const [trabajo] = await db()
        .insert(generationJobs)
        .values({
          userId: actor.id,
          kind,
          provider: "kie",
          model: "modelo-de-prueba",
          prompt: "PROMPT-INTERNO-QUE-NO-SALE",
          input: {},
          sceneId: escena.id,
          state: "listo",
          resultMediaId: resultado,
          estimatedCredits: 10,
          consumedCredits: 8,
          finishedAt: new Date(),
        })
        .returning({ id: generationJobs.id });
      if (!trabajo) throw new Error("No se ha creado el trabajo de prueba.");
      trabajos.push(trabajo.id);
      await db()
        .insert(usageLedger)
        .values([
          {
            userId: actor.id,
            jobId: trabajo.id,
            provider: "kie",
            model: "modelo-de-prueba",
            entryType: "reserva",
            credits: 10,
          },
          {
            userId: actor.id,
            jobId: trabajo.id,
            provider: "kie",
            model: "modelo-de-prueba",
            entryType: "liberacion",
            credits: -10,
          },
          {
            userId: actor.id,
            jobId: trabajo.id,
            provider: "kie",
            model: "modelo-de-prueba",
            entryType: "consumo",
            credits: 8,
            amountEur: 0.04,
          },
        ]);
    }
  }
  const montado = await medioDePrueba(actor, "montaje.png");
  const [montaje] = await db().insert(montages).values({ projectId: proyecto.id }).returning({ id: montages.id });
  if (!montaje) throw new Error("No se ha creado el montaje de prueba.");
  await db().insert(montageExports).values({
    projectId: proyecto.id,
    montageId: montaje.id,
    montageVersion: 1,
    format: "vertical_9_16",
    width: 1080,
    height: 1920,
    state: "listo",
    resultMediaId: montado.id,
    subtitlesSrt: "1\n00:00:00,000 --> 00:00:02,000\nHola\n",
    finishedAt: new Date(),
  });
  return { proyectoId: proyecto.id, escenas, trabajos, generados, montado, subida };
}

export async function borrarProyectoDePrueba(proyectoId: string): Promise<void> {
  await db().delete(projects).where(eq(projects.id, proyectoId));
}
