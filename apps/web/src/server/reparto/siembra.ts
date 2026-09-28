import { porDefectoDelReparto } from "@/lib/reparto";
import type { Ejecutor } from "../db/cliente";
import { sceneCharacters } from "../db/esquema";

/**
 * **Siembra del reparto de una escena nueva** (0.28.0): el protagonista del proyecto entra como `hablante`, a la
 * izquierda y a cámara.
 *
 * Es lo mismo que hizo la migración con las escenas ya escritas, y por eso vive en una función y no copiado en
 * dos sitios: si una escena nueva no sembrara su reparto, la puerta de consentimiento por personaje solo
 * evaluaría a las escenas antiguas, que es exactamente el agujero que la fase cierra.
 *
 * Sin protagonista en el proyecto no se siembra nada: es lo que tenía esa escena antes y sigue valiendo.
 */
export async function sembrarRepartoInicial(tx: Ejecutor, escenaId: string, personajeId: string | null): Promise<void> {
  if (!personajeId) return;
  const { papel, lado, mirada } = porDefectoDelReparto("solo", 1);
  await tx
    .insert(sceneCharacters)
    .values({
      sceneId: escenaId,
      characterId: personajeId,
      role: papel,
      side: lado,
      gazeDirection: mirada,
      sortOrder: 1,
    })
    // Repetir la siembra (un reintento, una escena que ya lo tenía) no es un error: ya está puesto.
    .onConflictDoNothing({ target: [sceneCharacters.sceneId, sceneCharacters.characterId] });
}
