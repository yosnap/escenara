import { ErrorGeneracion } from "./errores";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Identificador opcional que llega del navegador: o es un UUID, o no viene. La cadena vacía cuenta como **ausente**:
 * tratarla como un valor dejaba que `personajeId: ""` saltara la herencia del personaje de una imagen suelta, y con
 * ella su consentimiento y la revisión de las fotos.
 */
export function uuidOpcional(valor: unknown, queEs: string): string | null {
  if (valor === undefined || valor === null || valor === "") return null;
  if (typeof valor !== "string" || !UUID.test(valor)) throw new ErrorGeneracion(400, `Ese ${queEs} no es válido.`);
  return valor;
}
