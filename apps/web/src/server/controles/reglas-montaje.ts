import type { Freno, Hechos } from "./contrato";

/**
 * Reglas del **montaje** (RF08) del motor de controles, aparte para que `motor.ts` no crezca más. Entran en la lista
 * de reglas del motor **en este mismo orden y en el mismo sitio** en el que estaban, así que la precedencia no cambia.
 */
export const REGLAS_MONTAJE: readonly ((h: Hechos) => Freno | null)[] = [
  // ── Material del montaje: no se monta un vídeo con escenas que no tienen clip (RF08, 0.32.0) ─────────
  (h) => {
    const sinClip = h.exportacion?.escenasSinClip ?? [];
    if (sinClip.length === 0) return null;
    const escenas = [...sinClip].sort((a, b) => a - b).join(", ");
    return {
      regla: "montaje-sin-material",
      estado: "bloqueado",
      motivo:
        sinClip.length === 1
          ? `La escena ${escenas} está en el montaje y todavía no tiene clip guardado.`
          : `${sinClip.length} escenas del montaje todavía no tienen clip guardado (${escenas}).`,
      accion: "Prodúcelas o quítalas de la línea de tiempo antes de exportar.",
      enlace: "/proyectos",
      http: 409,
      excepcion: "proyecto",
    };
  },
  // ── Afirmaciones de salud: lo que impide aprobar el plan impide también exportar (0.35.0) ────────────
  (h) => {
    const escenas = [...(h.exportacion?.afirmacionesSalud ?? [])].sort((a, b) => a - b);
    if (escenas.length === 0) return null;
    return {
      regla: "montaje-afirmaciones-salud",
      estado: "bloqueado",
      motivo:
        escenas.length === 1
          ? `La escena ${escenas[0]} tiene una afirmación sobre salud sin verificar.`
          : `${escenas.length} escenas del montaje tienen afirmaciones sobre salud sin verificar (${escenas.join(", ")}).`,
      accion:
        "Verifícala, corrígela o descártala en el paso Escenas del proyecto antes de exportar: un vídeo no sale con una afirmación de salud sin revisar.",
      enlace: "/proyectos",
      http: 409,
      excepcion: "proyecto",
    };
  },
  (h) =>
    h.exportacion?.fragmentos === 0
      ? {
          regla: "montaje-vacio",
          estado: "bloqueado",
          motivo: "La línea de tiempo de este montaje está vacía.",
          accion: "Añade al menos una escena con clip antes de exportar.",
          enlace: "/proyectos",
          http: 409,
          excepcion: "proyecto",
        }
      : null,
];
