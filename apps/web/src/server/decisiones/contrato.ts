import type { TipoTrabajo } from "@/lib/generacion";

/**
 * Contrato interno de decisiones, preparado para 0.24.0 (Jev y Laya). Hoy **no hay ningún servicio
 * externo**: la única implementación son reglas deterministas en `reglas.ts`.
 *
 * La forma del contrato es la que tendrá cuando haya un servicio detrás: una entrada serializable, un
 * veredicto con su evidencia escrita y el coste de haber decidido. Así 0.24.0 solo tiene que añadir otra
 * implementación de {@link Decisor}, sin tocar a quien la usa.
 */

/** Veredicto. `revisar` no bloquea: avisa de que algo merece una mirada. */
export const ESTADOS_DECISION = ["aprobado", "revisar", "rechazado"] as const;
export type EstadoDecision = (typeof ESTADOS_DECISION)[number];

export interface EntradaDecision {
  tipo: TipoTrabajo;
  /** Descripción de la escena, tal como la escribió la persona. */
  escena: string;
  /** Lo que dice el personaje; vacío si no hay. */
  dialogo: string;
  /**
   * Bloque de contexto que el servidor añade al prompt a partir de la ficha del personaje (0.15.0); vacío si el
   * trabajo no lleva personaje o su ficha no dice nada.
   *
   * Va **aparte de `escena`** a propósito: `escena` es lo que escribió la persona, y las reglas que miden su
   * longitud tienen que seguir midiendo eso. Meter el contexto dentro haría que una ficha rellena colara una
   * descripción demasiado corta.
   */
  contexto: string;
  /** El modelo elegido genera voz. */
  conVoz: boolean;
  /** Hay imagen de referencia propia. */
  conReferencia: boolean;
  /** Créditos estimados del trabajo. */
  creditos: number;
}

export interface Decision {
  estado: EstadoDecision;
  /**
   * Por qué se ha decidido eso, en texto apto para mostrar. Nunca está vacío: una decisión sin evidencia no
   * se puede discutir.
   */
  evidencia: string;
  /** Lo que ha costado decidir, en créditos. Las reglas deterministas cuestan cero. */
  coste: number;
}

export interface Decisor {
  readonly nombre: string;
  decidir(entrada: EntradaDecision): Promise<Decision>;
}
