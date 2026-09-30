import type { EstadoEscena } from "./proyectos";

/**
 * Reordenar las escenas del plan **no se guarda al soltar**: queda pendiente hasta que se confirma. Aquí está la
 * lógica sin pantalla: qué orden se ve y qué se le dice a la persona antes de guardarlo.
 *
 * Lo que el servidor hace al guardar (`reordenarEscenas`): solo reescribe la posición de cada escena. No quita la
 * aprobación del plan, no toca el estado de ninguna escena y no encarga ni cobra nada. Lo que sí depende de la
 * posición es el número de escena que citan los mensajes, cuál es la primera (el gancho del
 * anuncio está escrito en la que era la primera y no se traslada) y el orden que se propone al montar cuando todavía no hay un montaje guardado.
 */

/**
 * Orden pendiente aplicable a las escenas actuales. Si desde que se soltó se borró una escena, **se conserva** el
 * orden de las que quedan (borrar no descarta lo que se acaba de ordenar); una escena que no estuviera en el orden
 * pendiente entra al final. Devuelve `null` si no hay nada pendiente o si el resultado es el orden que ya hay.
 */
export function ordenAplicable(pendiente: readonly string[] | null, actuales: readonly string[]): string[] | null {
  if (pendiente === null) return null;
  const ids = new Set(actuales);
  const vistos = new Set<string>();
  const conservadas = pendiente.filter((id) => {
    if (!ids.has(id) || vistos.has(id)) return false;
    vistos.add(id);
    return true;
  });
  const resultado = [...conservadas, ...actuales.filter((id) => !vistos.has(id))];
  return resultado.every((id, i) => id === actuales[i]) ? null : resultado;
}

/** Lo que cambia (y lo que no) al guardar el orden, dicho claro y según haya escenas ya aprobadas o producidas. */
export function efectosDelOrden(estados: readonly EstadoEscena[]): string {
  const aprobadas = estados.filter((e) => e === "aprobada").length;
  const producidas = estados.filter((e) => e === "producida").length;
  const cambia =
    "Cambian los números de escena, cuál abre el vídeo y el orden que se propone al montar; un montaje que ya hayas guardado mantiene el suyo. El gancho del anuncio está escrito en el texto de la escena que era la primera y no se traslada: si la mueves, el vídeo deja de abrir con él.";
  if (aprobadas + producidas === 0) return `Todavía no hay escenas aprobadas ni producidas. ${cambia}`;
  const partes = [
    aprobadas > 0 ? `${aprobadas} aprobada${aprobadas === 1 ? "" : "s"}` : "",
    producidas > 0 ? `${producidas} producida${producidas === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return `Hay ${partes.join(" y ")}: cambiar el orden no quita su aprobación, no repite ni cobra nada y los clips ya hechos se quedan como están. ${cambia}`;
}
