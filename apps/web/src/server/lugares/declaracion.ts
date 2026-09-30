import { and, eq, isNull } from "drizzle-orm";
import {
  AVISO_INTERIOR,
  esAlcanceLugar,
  esEspacioLugar,
  esOrigenFotosLugar,
  esPersonasVisibles,
  type LugarVista,
  RECHAZO_MENORES,
  RECHAZO_RECONOCIBLES,
  VERSION_TEXTO_DECLARACION_LUGAR,
} from "@/lib/lugares";
import { db, type Ejecutor } from "../db/cliente";
import { placeDeclarations, placeReferences } from "../db/esquema-lugares";
import type { Actor } from "../media/servicio";
import { filaPropia, obtenerLugar } from "./consulta";
import { ErrorLugar } from "./errores";

/**
 * **Declaración de derechos de un lugar**, con el patrón de `consent_records`: como mucho una vigente por lugar,
 * revocable, y las revocadas se conservan como prueba de lo que se declaró.
 *
 * La aplicación no juzga si algo es legal: la declaración es del usuario. Lo que sí hace es **no aceptar** lo que
 * esta versión no admite, con la causa y qué hacer:
 *
 * - **menores, nunca**: sin la declaración expresa de que no sale ninguno, no hay declaración;
 * - **personas reconocibles, no**: se retiran con la edición de imagen o se sube otra foto. No se pixelan caras,
 *   porque el generador copia el pixelado en el fotograma (medido con dinero real);
 * - «retiradas» solo vale si la maestra **es** una foto editada, no la original con la gente;
 * - un **interior** privado o con restricciones exige declarar el permiso de quien lo gestiona.
 */

export interface DatosDeclaracionLugar {
  origenFotos?: unknown;
  alcance?: unknown;
  espacio?: unknown;
  permisoDelLugar?: unknown;
  /** Una de `RESPUESTAS_PERSONAS`: incluye «reconocibles», que se rechaza con su causa. */
  personasVisibles?: unknown;
  marcasVisibles?: unknown;
  sinMenores?: unknown;
}

const MOTIVO_CAMBIO_DE_FOTOS = "Han cambiado las fotos del lugar: la declaración hablaba de otras.";

/** Declara (o vuelve a declarar) los derechos del lugar. La anterior queda revocada en la misma transacción. */
export async function declararLugar(actor: Actor, id: unknown, datos: DatosDeclaracionLugar): Promise<LugarVista> {
  const lugar = await filaPropia(actor, id);
  if (datos.sinMenores !== true) throw new ErrorLugar(400, RECHAZO_MENORES);
  if (datos.personasVisibles === "reconocibles") throw new ErrorLugar(409, RECHAZO_RECONOCIBLES);
  if (!esPersonasVisibles(datos.personasVisibles)) {
    throw new ErrorLugar(400, "Dinos si en las fotos se ve gente y cómo se ve.");
  }
  if (!esOrigenFotosLugar(datos.origenFotos)) {
    throw new ErrorLugar(400, "Dinos de dónde salen las fotos: tuyas, de alguien con permiso o generadas aquí.");
  }
  const alcance = datos.alcance ?? "personal";
  if (!esAlcanceLugar(alcance)) throw new ErrorLugar(400, "El uso es personal o comercial: elige uno de los dos.");
  const espacio = datos.espacio ?? "exterior";
  if (!esEspacioLugar(espacio)) throw new ErrorLugar(400, "Dinos si es un exterior o un interior.");
  const permiso = datos.permisoDelLugar === true;
  if (espacio === "interior" && !permiso) throw new ErrorLugar(400, AVISO_INTERIOR);

  const referencias = await db()
    .select({ kind: placeReferences.kind, origin: placeReferences.origin })
    .from(placeReferences)
    .where(eq(placeReferences.placeId, lugar.id));
  if (referencias.length === 0) {
    throw new ErrorLugar(409, "Añade al menos una foto al lugar antes de declarar sus derechos.");
  }
  const maestra = referencias.find((r) => r.kind === "maestra");
  if (datos.personasVisibles === "retiradas" && maestra?.origin !== "vista_generada") {
    throw new ErrorLugar(
      409,
      "Has dicho que retiraste a la gente, pero la maestra es la foto original. Marca como maestra la foto editada con «Retirar personas» y vuelve a declarar.",
    );
  }
  await db().transaction(async (tx) => {
    await tx
      .update(placeDeclarations)
      .set({ revokedAt: new Date(), revocationReason: "Sustituida por una declaración nueva." })
      .where(and(eq(placeDeclarations.placeId, lugar.id), isNull(placeDeclarations.revokedAt)));
    await tx.insert(placeDeclarations).values({
      placeId: lugar.id,
      photoOrigin: datos.origenFotos as "propias" | "con_permiso" | "generadas",
      scope: alcance,
      space: espacio,
      placePermission: permiso,
      peopleVisible: datos.personasVisibles as "ninguna" | "no_reconocibles" | "retiradas",
      brandsVisible: datos.marcasVisibles === true,
      noMinorsDeclared: true,
      textVersion: VERSION_TEXTO_DECLARACION_LUGAR,
      declaredBy: actor.id,
    });
  });
  return obtenerLugar(actor, lugar.id);
}

/** Revoca la declaración vigente. Desde ese momento no se genera con el lugar; lo ya generado se conserva. */
export async function revocarDeclaracionDeLugar(actor: Actor, id: unknown, motivo: unknown): Promise<LugarVista> {
  const lugar = await filaPropia(actor, id);
  const texto = typeof motivo === "string" ? motivo.trim().slice(0, 300) : "";
  const hechas = await db()
    .update(placeDeclarations)
    .set({ revokedAt: new Date(), revocationReason: texto === "" ? "Revocada por su dueño." : texto })
    .where(and(eq(placeDeclarations.placeId, lugar.id), isNull(placeDeclarations.revokedAt)))
    .returning({ id: placeDeclarations.id });
  if (hechas.length === 0) throw new ErrorLugar(409, "Este lugar no tiene ninguna declaración vigente que revocar.");
  return obtenerLugar(actor, lugar.id);
}

/** Cambiar las fotos retira la declaración vigente: hablaba de otras. Va en la transacción del cambio. */
export async function revocarPorCambioDeFotos(tx: Ejecutor, lugarId: string): Promise<void> {
  await tx
    .update(placeDeclarations)
    .set({ revokedAt: new Date(), revocationReason: MOTIVO_CAMBIO_DE_FOTOS })
    .where(and(eq(placeDeclarations.placeId, lugarId), isNull(placeDeclarations.revokedAt)));
}
