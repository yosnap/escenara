import { mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/** Copia privada de la biblioteca de UNA cuenta. No genera, publica ni modifica la base de datos. */
const raiz = path.resolve(import.meta.dirname, "../../..");
loadEnvConfig(raiz, true, console, true);
const correo = process.argv[2];
const continuo = process.argv.includes("--watch");
if (!correo || correo.startsWith("--")) throw new Error("Uso: bun scripts/archivar-demos.ts CORREO [--watch]");
const { and, eq, isNull } = await import("drizzle-orm");
const { db, olvidarConexion } = await import("../src/server/db/cliente");
const { generationJobs, media, projects, scenes, users } = await import("../src/server/db/esquema");
const { leerObjeto } = await import("../src/server/almacenamiento");
let parar = false;
process.on("SIGINT", () => {
  parar = true;
});
process.on("SIGTERM", () => {
  parar = true;
});

try {
  const [usuario] = await db().select({ id: users.id, email: users.email }).from(users).where(eq(users.email, correo));
  if (!usuario) throw new Error("No existe la cuenta indicada.");
  // El UUID permanece al migrar la base: renombrar el correo no mezcla los archivos con otra cuenta.
  const carpeta = path.join(raiz, "docs/privado/demos", usuario.id);
  await mkdir(carpeta, { recursive: true, mode: 0o700 });
  do {
    try {
      const medios = await db()
        .select()
        .from(media)
        .where(and(eq(media.ownerId, usuario.id), isNull(media.deletedAt)));
      const archivos: { id: string; archivo: string; titulo: string; tipo: string; bytes: number }[] = [];
      for (const medio of medios) {
        const directorio = path.join(carpeta, medio.kind);
        await mkdir(directorio, { recursive: true, mode: 0o700 });
        const extension = path.extname(medio.storageKey);
        if (!/^\.[a-z0-9]{1,8}$/i.test(extension)) throw new Error(`Extensión no reconocida para ${medio.id}.`);
        // Cambiar el objeto conserva también la copia anterior, incluso si el tamaño coincide.
        const archivo = path.join(directorio, `${medio.id}-${Bun.hash(medio.storageKey).toString(16)}${extension}`);
        const existente = await stat(archivo).catch((e: NodeJS.ErrnoException) => {
          if (e.code === "ENOENT") return null;
          throw e;
        });
        if (existente?.size !== medio.sizeBytes) {
          await Bun.write(`${archivo}.parcial`, leerObjeto(medio.storageKey));
          const copia = await stat(`${archivo}.parcial`);
          if (copia.size !== medio.sizeBytes) throw new Error(`Copia incompleta para ${medio.id}.`);
          await rename(`${archivo}.parcial`, archivo);
          console.log(`[demos] ${medio.kind} ${medio.id} archivado`);
        }
        archivos.push({
          id: medio.id,
          archivo: path.relative(carpeta, archivo),
          titulo: medio.title || medio.originalName,
          tipo: medio.kind,
          bytes: medio.sizeBytes,
        });
      }
      // Lista blanca: se guarda el recorrido, nunca cuentas de acceso, credenciales ni respuestas crudas del proveedor.
      const trabajos = await db()
        .select({
          id: generationJobs.id,
          tipo: generationJobs.kind,
          estado: generationJobs.state,
          modelo: generationJobs.model,
          plantillaId: generationJobs.promptTemplateId,
          versionPlantillaId: generationJobs.promptTemplateVersionId,
          escenaId: generationJobs.sceneId,
          proyectoId: generationJobs.projectId,
          resultadoId: generationJobs.resultMediaId,
          prompt: generationJobs.prompt,
          estimados: generationJobs.estimatedCredits,
          consumidos: generationJobs.consumedCredits,
          fecha: generationJobs.createdAt,
        })
        .from(generationJobs)
        .where(eq(generationJobs.userId, usuario.id));
      const proyectos = await db()
        .select({
          id: projects.id,
          titulo: projects.title,
          idea: projects.idea,
          concepto: projects.concept,
          estado: projects.state,
        })
        .from(projects)
        .where(eq(projects.userId, usuario.id));
      const manifiesto = path.join(carpeta, "archivo.json");
      const escenas = await db()
        .select({ escena: scenes })
        .from(scenes)
        .innerJoin(projects, eq(scenes.projectId, projects.id))
        .where(eq(projects.userId, usuario.id));
      await Bun.write(
        `${manifiesto}.parcial`,
        JSON.stringify({ usuario, actualizado: new Date(), archivos, trabajos, proyectos, escenas }, null, 2),
      );
      await rename(`${manifiesto}.parcial`, manifiesto);
      if (!continuo) console.log(`[demos] ${archivos.length} medios guardados en ${carpeta}`);
    } catch (error) {
      // En seguimiento, una caída de S3/DB no desactiva el archivado de las siguientes creaciones.
      if (!continuo) throw error;
      console.error(`[demos] ${error instanceof Error ? error.message : "No se pudo archivar"}`);
    }
    if (continuo && !parar) await Bun.sleep(15_000);
  } while (continuo && !parar);
} finally {
  await olvidarConexion();
}
