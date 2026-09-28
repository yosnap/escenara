import { PROMPT_MINIMO } from "@/lib/generacion";
import type { Decision, Decisor, EntradaDecision } from "./contrato";

/**
 * Decisor de reglas deterministas: la única implementación del contrato mientras no haya servicio externo
 * (0.24.0). No llama a nadie, no cuesta nada y siempre devuelve el mismo veredicto para la misma entrada.
 *
 * Solo comprueba cosas que se pueden afirmar sin juzgar el contenido: que haya descripción de verdad, que no
 * se pida voz a un modelo que no la tiene y que un fotograma no lleve frase (los modelos de imagen la
 * dibujan como texto, medido en la comparativa del 2026-09-27).
 */

const REGLAS: readonly ((e: EntradaDecision) => Decision | null)[] = [
  (e) =>
    e.escena.trim().length < PROMPT_MINIMO
      ? {
          estado: "rechazado",
          evidencia: `La descripción de la escena tiene ${e.escena.trim().length} caracteres y hacen falta al menos ${PROMPT_MINIMO}.`,
          coste: 0,
        }
      : null,
  (e) =>
    e.tipo === "fotograma" && !e.conReferencia && e.sinReferencia !== true
      ? { estado: "rechazado", evidencia: "Un fotograma necesita una imagen de referencia propia.", coste: 0 }
      : null,
  (e) =>
    e.dialogo !== "" && !e.conVoz
      ? {
          estado: "revisar",
          evidencia: "El modelo elegido no genera voz, así que lo que dice el personaje no se usará.",
          coste: 0,
        }
      : null,
  (e) =>
    e.creditos <= 0
      ? {
          estado: "rechazado",
          evidencia: "El coste estimado del trabajo es cero, así que el precio registrado no sirve para decidir.",
          coste: 0,
        }
      : null,
];

export const decisorDeReglas: Decisor = {
  nombre: "reglas-deterministas",
  async decidir(entrada: EntradaDecision): Promise<Decision> {
    const veredictos = REGLAS.map((regla) => regla(entrada)).filter((d): d is Decision => d !== null);
    const rechazo = veredictos.find((d) => d.estado === "rechazado");
    if (rechazo) return rechazo;
    const revision = veredictos.find((d) => d.estado === "revisar");
    if (revision) return revision;
    return { estado: "aprobado", evidencia: "Cumple las comprobaciones previas de esta instalación.", coste: 0 };
  },
};

/** Decisor vigente en esta instalación. 0.24.0 sustituirá esto por la elección entre reglas y servicio. */
export const decidir = (entrada: EntradaDecision): Promise<Decision> => decisorDeReglas.decidir(entrada);
