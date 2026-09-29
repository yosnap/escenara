import { eq } from "drizzle-orm";
import { bloqueDeEstiloAnimado } from "@/lib/animados";
import { db } from "../db/cliente";
import { characters, type FilaPersonaje, projects, sceneCharacters, scenes } from "../db/esquema";
import { ErrorGeneracion } from "../generacion/errores";

/** Aplica la guía del protagonista a los planos sin personaje y prohíbe mezclar acabados en una escena. */
export async function contextoAnimadoDeEscena(
  escenaId: string | null,
  personaje: Pick<FilaPersonaje, "id" | "renderStyle"> | null,
): Promise<string> {
  if (!escenaId) return "";
  const [fila] = await db()
    .select({ proyecto: projects })
    .from(scenes)
    .innerJoin(projects, eq(projects.id, scenes.projectId))
    .where(eq(scenes.id, escenaId))
    .limit(1);
  if (!fila) return "";
  const { proyecto } = fila;
  if (personaje && personaje.renderStyle !== proyecto.renderStyle) {
    throw new ErrorGeneracion(
      409,
      "El estilo del personaje y el del proyecto no coinciden. Elige un personaje con el mismo acabado antes de generar; no se ha reservado ningún crédito.",
    );
  }
  const reparto = await db()
    .select({ nombre: characters.name, estilo: characters.renderStyle })
    .from(sceneCharacters)
    .innerJoin(characters, eq(characters.id, sceneCharacters.characterId))
    .where(eq(sceneCharacters.sceneId, escenaId));
  const distinto = reparto.find((miembro) => miembro.estilo !== proyecto.renderStyle);
  if (distinto) {
    throw new ErrorGeneracion(
      409,
      `«${distinto.nombre}» tiene un acabado distinto al del proyecto. Usa personajes del mismo estilo en el reparto antes de generar; no se ha reservado ningún crédito.`,
    );
  }
  if (proyecto.renderStyle !== "animado") return "";
  const [principal] = proyecto.mainCharacterId
    ? await db().select().from(characters).where(eq(characters.id, proyecto.mainCharacterId)).limit(1)
    : [];
  if (!principal || principal.renderStyle !== "animado" || !principal.masterFrameMediaId) {
    throw new ErrorGeneracion(
      409,
      "El proyecto animado necesita un protagonista inventado con retrato maestro aprobado para conservar el estilo en este plano.",
    );
  }
  if (personaje) return ""; // Su versión ya aporta la guía y el fotograma maestro.
  return bloqueDeEstiloAnimado(principal.styleGuide);
}
