import { existsSync } from "node:fs";
import path from "node:path";

/** Carpetas de `docs/privado` donde `preparar-cuenta-demos.ts` guarda el acceso de cada cuenta dedicada que crea. */
export const CARPETAS_DEDICADAS = ["demos", "tutoriales"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ruta del acceso que deja el alta de una cuenta dedicada. */
export function rutaDeAcceso(raiz: string, carpeta: string, usuarioId: string): string {
  if (!UUID.test(usuarioId)) throw new Error("El identificador de la cuenta no es válido.");
  return path.join(raiz, "docs/privado", carpeta, usuarioId, "acceso.json");
}

/**
 * Una cuenta es dedicada (demos, tutoriales) solo si la dio de alta `preparar-cuenta-demos.ts`, que guarda su acceso
 * en `docs/privado/<carpeta>/<id>`. Así un correo equivocado nunca apunta a la cuenta de una persona.
 */
export function esCuentaDedicada(
  raiz: string,
  usuarioId: string,
  carpetas: readonly string[] = CARPETAS_DEDICADAS,
  existe: (ruta: string) => boolean = existsSync,
): boolean {
  return carpetas.some((carpeta) => existe(rutaDeAcceso(raiz, carpeta, usuarioId)));
}
