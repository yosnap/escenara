import { and, count, eq, sql } from "drizzle-orm";
import {
  DECLARACION_PUBLICAR,
  DESCRIPCION_MAXIMA,
  esTipoPublicacion,
  FIRMA_MAXIMA,
  type MiPublicacionVista,
  TITULO_MAXIMO,
  type TipoPublicacion,
} from "@/lib/comunidad";
import { motivoNombreReal, nombresRealesEn } from "@/lib/nombres-reales";
import { leerAjustes } from "../ajustes";
import { borrarObjeto, copiarObjeto } from "../almacenamiento";
import { apuntarObjetosPorBorrar } from "../datos/borrado-de-objetos";
import { db, type Ejecutor } from "../db/cliente";
import { communityChallenges, communityPostMedia, communityPosts } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { borrarCopiasYa, borrarPublicacionesEnTx } from "./borrado";
import { misPublicaciones } from "./consulta";
import { elegibilidadDe, type OrigenPublicable } from "./elegibilidad";
import { ErrorComunidad } from "./errores";
import { exigirUuid } from "./http";

/**
 * Publicar, editar y retirar. Tres reglas que no se negocian:
 *
 * - **Publicar es copiar**, con la elegibilidad comprobada **dentro de la transacción** y con los bloqueos en el orden
 *   de siempre (usuario → personaje o archivo), el mismo que usan los borrados de personaje, proyecto y cuenta: una
 *   publicación y un borrado del mismo original nunca se cruzan. Publicar dos veces lo mismo devuelve la que ya existe.
 * - **Editar vuelve a moderación**: la publicación deja de verse hasta que alguien apruebe la revisión nueva.
 * - **Retirar borra de verdad** la publicación y su copia, y nunca el original. Retirar dos veces no falla.
 */

export interface DatosPublicacion {
  origen: unknown;
  tipo: unknown;
  titulo: unknown;
  descripcion?: unknown;
  firma: unknown;
  reto?: unknown;
  declaracion: unknown;
}

function texto(valor: unknown, campo: string, minimo: number, maximo: number): string {
  const limpio = typeof valor === "string" ? valor.trim().replace(/[ \t]+/g, " ") : "";
  if (limpio.length < minimo) throw new ErrorComunidad(400, `${campo} necesita al menos ${minimo} caracteres.`);
  if (limpio.length > maximo) throw new ErrorComunidad(400, `${campo} no puede pasar de ${maximo} caracteres.`);
  return limpio;
}

/** Título, descripción y firma que verá la comunidad: con su longitud y sin nombrar a personas reales. */
function textosPublicos(datos: Pick<DatosPublicacion, "titulo" | "descripcion" | "firma">) {
  const titulo = texto(datos.titulo, "El título", 3, TITULO_MAXIMO);
  const descripcion = texto(datos.descripcion ?? "", "La descripción", 0, DESCRIPCION_MAXIMA);
  const firma = texto(datos.firma, "La firma", 2, FIRMA_MAXIMA);
  const reales = [...new Set(nombresRealesEn(`${titulo}\n${descripcion}\n${firma}`))];
  if (reales.length > 0) throw new ErrorComunidad(422, motivoNombreReal(reales));
  return { titulo, descripcion, firma };
}

function leerOrigen(valor: unknown): OrigenPublicable {
  const o = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  if (o.tipo !== "personaje" && o.tipo !== "medio") throw new ErrorComunidad(400, "Indica qué quieres publicar.");
  return { tipo: o.tipo, id: exigirUuid(o.id, o.tipo === "personaje" ? "Ese personaje" : "Ese archivo") };
}

/** Reto vigente elegido, o `null`. Uno cerrado o inexistente responde con su causa. */
async function retoVigente(ej: Ejecutor, valor: unknown): Promise<string | null> {
  if (valor === undefined || valor === null || valor === "") return null;
  const id = exigirUuid(valor, "Ese reto");
  const [reto] = await ej
    .select({ id: communityChallenges.id })
    .from(communityChallenges)
    .where(
      and(
        eq(communityChallenges.id, id),
        sql`${communityChallenges.startsAt} <= now() and ${communityChallenges.endsAt} > now()`,
      ),
    )
    .limit(1);
  if (!reto) throw new ErrorComunidad(409, "Ese reto no está abierto ahora: elige otro o publica sin reto.");
  return reto.id;
}

async function exigirComunidadActiva(): Promise<void> {
  if (!(await leerAjustes()).comunidadActiva) {
    throw new ErrorComunidad(
      409,
      "La comunidad está apagada en esta instalación: no se puede publicar. Quien administra la enciende en Admin › Ajustes › Comunidad.",
    );
  }
}

const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

async function miVistaDe(actor: Actor, id: string): Promise<MiPublicacionVista> {
  const vista = (await misPublicaciones(actor)).find((p) => p.id === id);
  if (!vista) throw new ErrorComunidad(404, "Esa publicación no existe.");
  return vista;
}

/** Publica una copia del original. Devuelve la publicación y si se ha creado ahora (`false`: ya existía). */
export async function publicar(
  actor: Actor,
  datos: DatosPublicacion,
): Promise<{ publicacion: MiPublicacionVista; creada: boolean }> {
  await exigirComunidadActiva();
  if (datos.declaracion !== true) {
    throw new ErrorComunidad(400, `Para publicar tienes que marcar la declaración: «${DECLARACION_PUBLICAR}»`);
  }
  const origen = leerOrigen(datos.origen);
  if (!esTipoPublicacion(datos.tipo)) throw new ErrorComunidad(400, "Elige cómo quieres publicarlo.");
  const tipo: TipoPublicacion = datos.tipo;
  if ((origen.tipo === "personaje") !== (tipo === "personaje")) {
    throw new ErrorComunidad(400, "Un personaje se publica como personaje, y un archivo como clip, trend o plantilla.");
  }
  const textos = textosPublicos(datos);
  const maximoPendientes = (await leerAjustes()).comunidadMaximoPendientes;
  const copiadas: string[] = [];

  try {
    const resultado = await db().transaction(async (tx) => {
      // Mismo orden que los borrados: usuario y después el original.
      await tx.execute(sql`select 1 from users where id = ${actor.id} for update`);
      if (origen.tipo === "personaje") {
        await tx.execute(sql`select 1 from characters where id = ${origen.id} for update`);
      } else {
        await tx.execute(sql`select 1 from media where id = ${origen.id} for share`);
      }
      const [existente] = await tx
        .select({ id: communityPosts.id })
        .from(communityPosts)
        .where(
          origen.tipo === "personaje"
            ? eq(communityPosts.sourceCharacterId, origen.id)
            : eq(communityPosts.sourceMediaId, origen.id),
        )
        .limit(1);
      if (existente) return { id: existente.id, creada: false };

      const [pendientes] = await tx
        .select({ total: count() })
        .from(communityPosts)
        .where(and(eq(communityPosts.authorId, actor.id), eq(communityPosts.state, "pendiente")));
      if ((pendientes?.total ?? 0) >= maximoPendientes) {
        throw new ErrorComunidad(
          429,
          `Ya tienes ${maximoPendientes} publicaciones esperando moderación: espera a que se revisen antes de enviar otra.`,
        );
      }

      const eleg = await elegibilidadDe(tx, actor.id, origen);
      if (!eleg.publicable) throw new ErrorComunidad(422, `No se puede publicar: ${eleg.motivos.join(" ")}`);
      if (!eleg.tipos.includes(tipo)) {
        throw new ErrorComunidad(
          400,
          tipo === "clip"
            ? "Esto no se puede publicar como clip."
            : `No se hizo con ningún ${tipo} de la instalación que siga activo: publícalo como clip.`,
        );
      }
      const challengeId = await retoVigente(tx, datos.reto);
      const [fila] = await tx
        .insert(communityPosts)
        .values({
          authorId: actor.id,
          kind: tipo,
          title: textos.titulo,
          description: textos.descripcion,
          signature: textos.firma,
          sourceCharacterId: origen.tipo === "personaje" ? origen.id : null,
          sourceMediaId: origen.tipo === "medio" ? origen.id : null,
          templateId: tipo === "trend" || tipo === "plantilla" ? (eleg.plantilla?.id ?? null) : null,
          challengeId,
          consentText: DECLARACION_PUBLICAR,
          consentAt: new Date(),
        })
        .returning({ id: communityPosts.id });
      if (!fila) throw new ErrorComunidad(500, "No se ha podido guardar la publicación: no se ha publicado nada.");
      for (const [posicion, medio] of eleg.medios.entries()) {
        const clave = `comunidad/${fila.id}/${posicion}-${crypto.randomUUID()}.${EXTENSION[medio.mime] ?? "bin"}`;
        await copiarObjeto(medio.clave, clave, medio.mime).catch((error: unknown) => {
          throw new ErrorComunidad(
            502,
            `El almacenamiento no ha dejado copiar el archivo (${String(error).slice(0, 120)}): no se ha publicado nada. Vuelve a intentarlo.`,
          );
        });
        copiadas.push(clave);
        await tx.insert(communityPostMedia).values({
          postId: fila.id,
          position: posicion,
          kind: medio.tipo,
          storageKey: clave,
          mimeType: medio.mime,
          width: medio.ancho,
          height: medio.alto,
          durationSeconds: medio.duracion,
          altEs: medio.alt,
        });
      }
      return { id: fila.id, creada: true };
    });
    return { publicacion: await miVistaDe(actor, resultado.id), creada: resultado.creada };
  } catch (error) {
    // La transacción no se ha confirmado: las copias ya hechas sobran. Se borran ya y, si no se puede, se apuntan.
    if (copiadas.length > 0) await descartarCopias(copiadas);
    throw error;
  }
}

async function descartarCopias(claves: string[]): Promise<void> {
  const fallidas: string[] = [];
  for (const clave of claves) await borrarObjeto(clave).catch(() => fallidas.push(clave));
  if (fallidas.length > 0) {
    await apuntarObjetosPorBorrar(db(), fallidas, "comunidad").catch((error: unknown) =>
      console.error(`[comunidad] copias sin borrar tras un fallo al publicar: ${String(error).slice(0, 200)}`),
    );
  }
}

/** Bloquea la publicación **propia** (usuario → publicación). Una ajena o inexistente: `null`. */
async function propiaBloqueada(tx: Ejecutor, actor: Actor, id: string) {
  await tx.execute(sql`select 1 from users where id = ${actor.id} for update`);
  const [fila] = await tx
    .select()
    .from(communityPosts)
    .where(and(eq(communityPosts.id, id), eq(communityPosts.authorId, actor.id)))
    .for("update");
  return fila ?? null;
}

/** Edita título, descripción, firma o reto. **Vuelve a moderación**: deja de verse hasta que se apruebe otra vez. */
export async function editar(
  actor: Actor,
  idPedido: unknown,
  datos: Pick<DatosPublicacion, "titulo" | "descripcion" | "firma" | "reto">,
): Promise<MiPublicacionVista> {
  await exigirComunidadActiva();
  const id = exigirUuid(idPedido);
  const textos = textosPublicos(datos);
  await db().transaction(async (tx) => {
    const fila = await propiaBloqueada(tx, actor, id);
    if (!fila) throw new ErrorComunidad(404, "Esa publicación no existe.");
    if (fila.sourceCharacterId === null && fila.sourceMediaId === null) {
      throw new ErrorComunidad(409, "El original ya no existe: esta publicación se va a borrar y no se puede editar.");
    }
    const challengeId = await retoVigente(tx, datos.reto);
    await tx
      .update(communityPosts)
      .set({
        title: textos.titulo,
        description: textos.descripcion,
        signature: textos.firma,
        challengeId,
        state: "pendiente",
        revision: sql`${communityPosts.revision} + 1`,
        moderatedBy: null,
        moderatedAt: null,
        rejectionReason: "",
        approvedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(communityPosts.id, id));
  });
  return await miVistaDe(actor, id);
}

/** Retira la publicación propia: borra la fila y la copia. Idempotente: si ya no existe, no pasa nada. */
export async function retirar(actor: Actor, idPedido: unknown): Promise<{ retirada: true }> {
  const id = exigirUuid(idPedido);
  const claves = await db().transaction(async (tx) => {
    const fila = await propiaBloqueada(tx, actor, id);
    if (!fila) return [];
    return await borrarPublicacionesEnTx(tx, eq(communityPosts.id, id));
  });
  await borrarCopiasYa(claves);
  return { retirada: true };
}
