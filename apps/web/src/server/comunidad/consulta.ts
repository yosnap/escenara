import { and, asc, count, desc, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";
import {
  type CandidatoAPublicar,
  DESCRIPCION_MAXIMA,
  type EslabonProcedencia,
  type MiPublicacionVista,
  type PublicacionEnModeracion,
  type PublicacionVista,
  ruta,
  type TipoPublicacion,
} from "@/lib/comunidad";
import { db, type Ejecutor } from "../db/cliente";
import {
  characters,
  communityChallenges,
  communityPostMedia,
  communityPosts,
  communityUses,
  type FilaPublicacion,
  generationJobs,
  media,
  promptTemplates,
} from "../db/esquema";
import type { Actor } from "../media/servicio";
import { condicionMedioNoReservado } from "../personajes/uso-de-medio";
import { elegibilidadDe } from "./elegibilidad";
import { ErrorComunidad } from "./errores";
import { procedenciaDeMedio, procedenciaDePersonaje } from "./procedencia";
import { CONCURRENCIA_COMUNIDAD, conConcurrencia } from "./tandas";
import { comunidadActiva, condicionVisible, esHuerfana, puedeVer } from "./visibilidad";

/**
 * Lecturas de la comunidad. Todo lo que sale hacia el navegador pasa por {@link vistasDe}, que es la **lista blanca de
 * campos**: título, descripción y firma que escribió el autor, las copias de los medios (por su ruta propia, nunca la
 * clave del almacenamiento), el nombre de la plantilla o el trend y el del reto. Nunca un prompt, un modelo, el correo o
 * el nombre de la cuenta, ni el identificador del original.
 */

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Vista pública de cada fila, con sus medios, su plantilla, su reto y sus usos. */
async function vistasDe(ej: Ejecutor, filas: FilaPublicacion[]): Promise<Map<string, PublicacionVista>> {
  const salida = new Map<string, PublicacionVista>();
  if (filas.length === 0) return salida;
  const ids = filas.map((f) => f.id);
  const plantillas = [...new Set(filas.flatMap((f) => (f.templateId ? [f.templateId] : [])))];
  const retos = [...new Set(filas.flatMap((f) => (f.challengeId ? [f.challengeId] : [])))];
  const [medios, nombres, titulos, usos] = await Promise.all([
    ej
      .select()
      .from(communityPostMedia)
      .where(inArray(communityPostMedia.postId, ids))
      .orderBy(asc(communityPostMedia.position)),
    plantillas.length
      ? ej
          .select({ id: promptTemplates.id, nombre: promptTemplates.name })
          .from(promptTemplates)
          .where(inArray(promptTemplates.id, plantillas))
      : Promise.resolve([]),
    retos.length
      ? ej
          .select({ id: communityChallenges.id, titulo: communityChallenges.title })
          .from(communityChallenges)
          .where(inArray(communityChallenges.id, retos))
      : Promise.resolve([]),
    ej
      .select({ id: communityUses.postId, total: count() })
      .from(communityUses)
      .where(inArray(communityUses.postId, ids))
      .groupBy(communityUses.postId),
  ]);
  const nombreDe = new Map(nombres.map((n) => [n.id, n.nombre]));
  const tituloDe = new Map(titulos.map((t) => [t.id, t.titulo]));
  const usosDe = new Map(usos.map((u) => [u.id, u.total]));
  for (const f of filas) {
    salida.set(f.id, {
      id: f.id,
      tipo: f.kind,
      titulo: f.title,
      descripcion: f.description,
      firma: f.signature,
      medios: medios
        .filter((m) => m.postId === f.id)
        .map((m) => ({
          url: ruta.medio(f.id, m.position),
          tipo: m.kind,
          ancho: m.width,
          alto: m.height,
          alt: m.altEs || `${f.title} (${m.kind === "video" ? "clip" : "imagen"} sintético)`,
        })),
      plantilla:
        f.templateId && nombreDe.has(f.templateId)
          ? { id: f.templateId, nombre: nombreDe.get(f.templateId) ?? "" }
          : null,
      reto:
        f.challengeId && tituloDe.has(f.challengeId)
          ? { id: f.challengeId, titulo: tituloDe.get(f.challengeId) ?? "" }
          : null,
      publicadaEl: iso(f.approvedAt),
      usos: usosDe.get(f.id) ?? 0,
    });
  }
  return salida;
}

function miVista(f: FilaPublicacion, publica: PublicacionVista, oculta: string | null = null): MiPublicacionVista {
  return {
    ...publica,
    estado: f.state,
    motivoRechazo: f.rejectionReason,
    revision: f.revision,
    huerfana: esHuerfana(f),
    oculta,
  };
}

/**
 * Por qué una publicación **aprobada** no la ven los demás (las mismas condiciones de `condicionVisible`, explicadas).
 * Solo para su autor y quien modera: la regla que decide sigue siendo `condicionVisible`.
 */
async function motivosDeOcultacion(ids: string[], quien: "autor" | "moderacion"): Promise<Map<string, string>> {
  const autor = quien === "autor";
  if (ids.length === 0) return new Map();
  const filas = (await db().execute(sql`
    select community_posts.id,
      (community_posts.source_character_id is null and community_posts.source_media_id is null) or community_posts.origin_character_id is null as huerfana,
      exists (select 1 from media m where m.id = community_posts.source_media_id and m.deleted_at is not null) as papelera,
      not exists (select 1 from consent_records crv where crv.character_id = community_posts.origin_character_id
                  and crv.revoked_at is null and crv.holder_type = 'inventado' and crv.synthetic_declared = true
                  and crv.registered_at <= community_posts.approved_at) as sin_declaracion,
      exists (select 1 from account_deletions ad where ad.user_id = community_posts.author_id
              and ad.state in ('programado', 'borrando_objetos')) as borrado
    from community_posts
    where community_posts.id in (${sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`, `,
    )}) and community_posts.state = 'aprobada' and not ${condicionVisible()}`)) as unknown as {
    id: string;
    huerfana: boolean;
    papelera: boolean;
    sin_declaracion: boolean;
    borrado: boolean;
  }[];
  return new Map(
    filas.map((f) => [
      f.id,
      f.huerfana
        ? "Su original ya no existe: se borrará en unos minutos."
        : f.papelera
          ? autor
            ? "Su original está en la papelera. Restáuralo y volverá a verse."
            : "Su original está en la papelera del autor: volverá a verse si lo restaura."
          : f.sin_declaracion
            ? autor
              ? "Su personaje ya no tiene vigente la declaración de personaje inventado, así que no se vuelve a enseñar. Una declaración revocada no se puede recuperar: puedes retirarla."
              : "Su personaje ya no tiene vigente la declaración de personaje inventado: no se vuelve a enseñar."
            : f.borrado
              ? autor
                ? "Tu cuenta está en periodo de borrado."
                : "La cuenta del autor está en periodo de borrado."
              : "No se puede enseñar ahora.",
    ]),
  );
}

export interface FiltroGaleria {
  tipo?: TipoPublicacion | null;
  reto?: string | null;
}

/** Galería: solo lo visible (aprobado, con original y autor sin borrado programado) y con la comunidad encendida. */
export async function galeria(filtro: FiltroGaleria = {}, limite = 60): Promise<PublicacionVista[]> {
  if (!(await comunidadActiva())) return [];
  const condiciones: SQL[] = [condicionVisible()];
  if (filtro.tipo) condiciones.push(eq(communityPosts.kind, filtro.tipo));
  if (filtro.reto) condiciones.push(eq(communityPosts.challengeId, filtro.reto));
  const filas = await db()
    .select()
    .from(communityPosts)
    .where(and(...condiciones))
    .orderBy(desc(communityPosts.approvedAt))
    .limit(limite);
  const vistas = await vistasDe(db(), filas);
  return filas.flatMap((f) => vistas.get(f.id) ?? []);
}

/** Las publicaciones propias, en cualquier estado, con el motivo del rechazo. */
export async function misPublicaciones(actor: Actor): Promise<MiPublicacionVista[]> {
  const filas = await db()
    .select()
    .from(communityPosts)
    .where(eq(communityPosts.authorId, actor.id))
    .orderBy(desc(communityPosts.createdAt));
  const [vistas, ocultas] = await Promise.all([
    vistasDe(db(), filas),
    motivosDeOcultacion(
      filas.map((f) => f.id),
      "autor",
    ),
  ]);
  return filas.flatMap((f) => {
    const v = vistas.get(f.id);
    return v ? [miVista(f, v, ocultas.get(f.id) ?? null)] : [];
  });
}

/**
 * Cola de moderación (solo quien administra): pendientes, de la más antigua a la más nueva, y las aprobadas (para
 * poder retirarlas con motivo). Cada una con su elegibilidad **comprobada otra vez ahora**, con la misma función que al
 * publicar. Las de cuentas en periodo de borrado no se enseñan: no se van a publicar.
 */
export async function colaDeModeracion(actor: Actor): Promise<{
  pendientes: PublicacionEnModeracion[];
  aprobadas: PublicacionEnModeracion[];
}> {
  if (!actor.esAdmin) throw new ErrorComunidad(404, "No existe.");
  const sinBorrado = sql`not exists (select 1 from account_deletions adm where adm.user_id = ${communityPosts.authorId}
    and adm.state in ('programado', 'borrando_objetos'))`;
  const [pendientes, aprobadas] = await Promise.all([
    db()
      .select()
      .from(communityPosts)
      .where(and(eq(communityPosts.state, "pendiente"), sinBorrado))
      .orderBy(asc(communityPosts.updatedAt))
      .limit(100),
    db()
      .select()
      .from(communityPosts)
      .where(and(eq(communityPosts.state, "aprobada"), sinBorrado))
      .orderBy(desc(communityPosts.approvedAt))
      .limit(100),
  ]);
  const vistas = await vistasDe(db(), [...pendientes, ...aprobadas]);
  const ocultas = await motivosDeOcultacion(
    aprobadas.map((f) => f.id),
    "moderacion",
  );
  const enModeracion = async (f: FilaPublicacion): Promise<PublicacionEnModeracion[]> => {
    const v = vistas.get(f.id);
    if (!v) return [];
    return [
      {
        ...miVista(f, v, ocultas.get(f.id) ?? null),
        esDeQuienModera: f.authorId === actor.id,
        elegibilidad: await elegibilidadActual(db(), f),
        procedencia: await procedenciaActual(f),
      },
    ];
  };
  return {
    // De cuatro en cuatro: cada una abre dos transacciones y el grupo de conexiones es de diez para toda la web.
    pendientes: (await conConcurrencia(pendientes, CONCURRENCIA_COMUNIDAD, enModeracion)).flat(),
    aprobadas: (await conConcurrencia(aprobadas, CONCURRENCIA_COMUNIDAD, enModeracion)).flat(),
  };
}

/** Procedencia del original para quien modera (sin JIT: es la misma consulta grande que decide). */
async function procedenciaActual(f: FilaPublicacion): Promise<EslabonProcedencia[]> {
  if (!f.sourceCharacterId && !f.sourceMediaId)
    return [{ paso: 0, descripcion: "El original ya no existe", seguro: false }];
  return await db().transaction(async (tx) => {
    await tx.execute(sql`set local jit = off`);
    return f.sourceCharacterId
      ? await procedenciaDePersonaje(tx, f.sourceCharacterId)
      : await procedenciaDeMedio(tx, f.sourceMediaId as string);
  });
}

/** Elegibilidad del original de una publicación, hoy. Sin original, no es publicable. */
export async function elegibilidadActual(ej: Ejecutor, f: FilaPublicacion) {
  const origen = f.sourceCharacterId
    ? ({ tipo: "personaje", id: f.sourceCharacterId } as const)
    : f.sourceMediaId
      ? ({ tipo: "medio", id: f.sourceMediaId } as const)
      : null;
  if (!origen) return { publicable: false, motivos: ["El original ya no existe: la publicación se va a borrar."] };
  try {
    const r = await elegibilidadDe(ej, f.authorId, origen);
    return { publicable: r.publicable, motivos: r.motivos };
  } catch (error) {
    if (error instanceof ErrorComunidad) return { publicable: false, motivos: [error.message] };
    throw error;
  }
}

/** Una publicación visible, para la atribución de «Usar» e «Inspirarse». `null` si no se puede ver. */
export async function publicacionVisible(
  id: string,
): Promise<(PublicacionVista & { plantillaId: string | null }) | null> {
  if (!(await comunidadActiva())) return null;
  const [fila] = await db()
    .select()
    .from(communityPosts)
    .where(and(eq(communityPosts.id, id), condicionVisible()))
    .limit(1);
  if (!fila) return null;
  const vista = (await vistasDe(db(), [fila])).get(fila.id);
  if (!vista) return null;
  return { ...vista, plantillaId: fila.templateId };
}

/** Archivo de una copia publicada, si `actor` puede verla. Todo lo demás responde 404 sin distinguir la causa. */
export async function archivoDePublicacion(
  actor: Actor,
  publicacionId: string,
  posicion: number,
): Promise<{ clave: string; mime: string }> {
  const [fila] = await db()
    .select({ publicacion: communityPosts, visible: sql<boolean>`${condicionVisible()}` })
    .from(communityPosts)
    .where(eq(communityPosts.id, publicacionId))
    .limit(1);
  if (!fila || !(await puedeVer(actor, fila.publicacion, fila.visible)))
    throw new ErrorComunidad(404, "Ese archivo no existe.");
  const [medio] = await db()
    .select()
    .from(communityPostMedia)
    .where(and(eq(communityPostMedia.postId, publicacionId), eq(communityPostMedia.position, posicion)))
    .limit(1);
  if (!medio) throw new ErrorComunidad(404, "Ese archivo no existe.");
  return { clave: medio.storageKey, mime: medio.mimeType };
}

/**
 * Lo que el usuario podría publicar: sus personajes y sus últimos resultados generados, cada uno con su elegibilidad
 * (la misma función que decide al publicar) y la publicación que ya tenga, si la tiene.
 */
export async function candidatos(actor: Actor, limite = 24): Promise<CandidatoAPublicar[]> {
  const [personajes, resultados, publicadas] = await Promise.all([
    db()
      .select({ id: characters.id })
      .from(characters)
      .where(eq(characters.ownerId, actor.id))
      .orderBy(desc(characters.updatedAt))
      .limit(limite),
    db()
      .selectDistinct({ id: media.id, creado: media.createdAt })
      .from(media)
      .innerJoin(generationJobs, eq(generationJobs.resultMediaId, media.id))
      // Sin material reservado (vistas y hojas de personaje, documentos): no se publica por sí solo y solo metería ruido.
      .where(
        and(
          eq(media.ownerId, actor.id),
          isNull(media.deletedAt),
          inArray(media.kind, ["imagen", "video"]),
          condicionMedioNoReservado(),
        ),
      )
      .orderBy(desc(media.createdAt))
      .limit(limite),
    db()
      .select({
        id: communityPosts.id,
        estado: communityPosts.state,
        personaje: communityPosts.sourceCharacterId,
        medio: communityPosts.sourceMediaId,
      })
      .from(communityPosts)
      .where(eq(communityPosts.authorId, actor.id)),
  ]);
  const deOrigen = new Map(publicadas.flatMap((p) => [[p.personaje ?? p.medio ?? "", p] as const]));
  const origenes = [
    ...personajes.map((p) => ({ tipo: "personaje" as const, id: p.id })),
    ...resultados.map((r) => ({ tipo: "medio" as const, id: r.id })),
  ];
  return await conConcurrencia(origenes, CONCURRENCIA_COMUNIDAD, (origen) =>
    candidato(actor, origen, deOrigen.get(origen.id) ?? null),
  );
}

/** Un candidato concreto (la página de publicar con `?personaje=` o `?medio=`). */
export async function candidato(
  actor: Actor,
  origen: { tipo: "personaje" | "medio"; id: string },
  publicada?: { id: string; estado: FilaPublicacion["state"] } | null,
): Promise<CandidatoAPublicar> {
  const r = await elegibilidadDe(db(), actor.id, origen);
  let publicacion = publicada ?? null;
  if (publicada === undefined) {
    const [p] = await db()
      .select({ id: communityPosts.id, estado: communityPosts.state })
      .from(communityPosts)
      .where(
        and(
          eq(communityPosts.authorId, actor.id),
          origen.tipo === "personaje"
            ? eq(communityPosts.sourceCharacterId, origen.id)
            : eq(communityPosts.sourceMediaId, origen.id),
        ),
      )
      .limit(1);
    publicacion = p ?? null;
  }
  const miniatura = await miniaturaDe(origen);
  return {
    origen,
    nombre: r.nombre,
    descripcionSugerida: r.descripcion.slice(0, DESCRIPCION_MAXIMA),
    miniatura,
    tipos: r.tipos,
    plantilla: r.plantilla,
    elegibilidad: { publicable: r.publicable, motivos: r.motivos },
    publicacion: publicacion ? { id: publicacion.id, estado: publicacion.estado } : null,
  };
}

/** Miniatura del original **para su dueño**, por la ruta de la biblioteca (que ya exige ser el dueño). */
async function miniaturaDe(origen: {
  tipo: "personaje" | "medio";
  id: string;
}): Promise<CandidatoAPublicar["miniatura"]> {
  if (origen.tipo === "medio") {
    const [m] = await db().select({ kind: media.kind }).from(media).where(eq(media.id, origen.id)).limit(1);
    return m && (m.kind === "imagen" || m.kind === "video")
      ? { url: `/api/media/${origen.id}/archivo`, tipo: m.kind }
      : null;
  }
  const [p] = await db()
    .select({ maestro: characters.masterFrameMediaId })
    .from(characters)
    .where(eq(characters.id, origen.id))
    .limit(1);
  const vista = p?.maestro
    ? p.maestro
    : (
        (await db().execute(sql`select media_id as id from character_references where character_id = ${origen.id}
          and origin = 'vista_generada' order by sort_order limit 1`)) as unknown as { id: string }[]
      )[0]?.id;
  return vista ? { url: `/api/media/${vista}/archivo`, tipo: "imagen" } : null;
}
