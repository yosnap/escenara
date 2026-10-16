import { and, asc, eq, sql } from "drizzle-orm";
import { esVista, type Vista } from "@/lib/captura-personaje";
import type { VistaEnCurso } from "@/lib/personajes";
import { db, type Ejecutor } from "../db/cliente";
import { type FilaTrabajo, generationJobs } from "../db/esquema";
import { condicionEnCurso, vistaDeFila } from "../generacion/trabajos";

/** Vista que pidió el trabajo, leída de su entrada guardada; `null` si no era una vista sintética. */
export function vistaSinteticaDe(fila: FilaTrabajo): Vista | null {
  const marca = (fila.input as { vistaSintetica?: unknown }).vistaSintetica;
  return esVista(marca) ? marca : null;
}

/**
 * Vistas de este personaje que tienen un trabajo encargado y todavía sin terminar, con ese trabajo (el más
 * reciente si hubiera más de uno). Es lo que impide pagar dos veces la misma vista y lo que deja a la ficha
 * reconocer, al recargar, que una vista ya se está generando.
 */
export async function vistasEnMarcha(personajeId: string, ejecutor: Ejecutor = db()): Promise<Map<Vista, FilaTrabajo>> {
  const filas = await ejecutor
    .select()
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.characterId, personajeId),
        condicionEnCurso(),
        sql`${generationJobs.input}->>'vistaSintetica' is not null`,
      ),
    )
    .orderBy(asc(generationJobs.createdAt));
  const vistas = new Map<Vista, FilaTrabajo>();
  for (const fila of filas) {
    const vista = vistaSinteticaDe(fila);
    if (vista) vistas.set(vista, fila);
  }
  return vistas;
}

/** Las mismas vistas, tal como las ve el navegador: cada una con el trabajo que hay que seguir. */
export async function vistasEnCursoDe(personajeId: string): Promise<VistaEnCurso[]> {
  const enMarcha = await vistasEnMarcha(personajeId);
  return Promise.all([...enMarcha].map(async ([vista, fila]) => ({ vista, trabajo: await vistaDeFila(fila) })));
}
