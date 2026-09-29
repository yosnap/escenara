import type { EstadoEscena } from "./proyectos";

/**
 * Reordenar las escenas del plan **no se guarda al soltar**: queda pendiente hasta que se confirma. Aquí está la
 * lógica sin pantalla: qué orden se ve y qué se le dice a la persona antes de guardarlo.
 *
 * Lo que el servidor hace al guardar (`reordenarEscenas`): solo reescribe la posición de cada escena. No quita la
 * aprobación del plan, no toca el estado de ninguna escena y no encarga ni cobra nada. Lo que sí depende de la
 * posición es el número de escena que citan los mensajes, cuál es la primera (la que lleva el gancho del
 * anuncio) y el orden que se propone al montar cuando todavía no hay un montaje guardado.
 */

/** Orden pendiente aplicable a las escenas actuales: si ya no son las mismas (se añadió o borró una), se descarta. */
export function ordenAplicable(pendiente: readonly string[] | null, actuales: readonly string[]): string[] | null {
  if (pendiente === null || pendiente.length !== actuales.length) return null;
  const ids = new Set(actuales);
  if (new Set(pendiente).size !== pendiente.length || pendiente.some((id) => !ids.has(id))) return null;
  return pendiente.every((id, i) => id === actuales[i]) ? null : [...pendiente];
}

/** Lo que cambia (y lo que no) al guardar el orden, dicho claro y según haya escenas ya aprobadas o producidas. */
export function efectosDelOrden(estados: readonly EstadoEscena[]): string {
  const aprobadas = estados.filter((e) => e === "aprobada").length;
  const producidas = estados.filter((e) => e === "producida").length;
  const cambia =
    "Cambian los números de escena, cuál abre el vídeo (la primera lleva el gancho) y el orden que se propone al montar; un montaje que ya hayas guardado mantiene el suyo.";
  if (aprobadas + producidas === 0) return `Todavía no hay escenas aprobadas ni producidas. ${cambia}`;
  const partes = [
    aprobadas > 0 ? `${aprobadas} aprobada${aprobadas === 1 ? "" : "s"}` : "",
    producidas > 0 ? `${producidas} producida${producidas === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return `Hay ${partes.join(" y ")}: cambiar el orden no quita su aprobación, no repite ni cobra nada y los clips ya hechos se quedan como están. ${cambia}`;
}
