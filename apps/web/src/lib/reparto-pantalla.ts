import {
  ETIQUETA_FORMATO_REPARTO,
  type FormatoReparto,
  type MiembroReparto,
  type RepartoVista,
  type TurnoReparto,
} from "./reparto";

/**
 * **Lo que se ha pedido, dicho en castellano** (0.28.0): las funciones puras con las que la pantalla de la escena
 * cuenta quién sale, por qué lado, quién habla y qué hace el otro.
 *
 * Existe por una regla del proyecto: **el prompt no se le muestra al usuario** (ADR-0022), y aun así el usuario
 * tiene derecho a saber exactamente qué se va a pedir antes de pagarlo. Así que lo que se enseña es esta
 * descripción —escrita aquí, en castellano, a partir del reparto guardado— y no el texto en inglés que compone el
 * servidor.
 *
 * Todo lo de este fichero es **puro**: entra el reparto tal como lo devuelve el servidor y sale texto. No hay
 * fechas del sistema, ni azar, ni peticiones, así que se puede probar palabra por palabra.
 */

// ── Previsualización de lo pedido ─────────────────────────────────────────────────────────────────────────

/** Cómo se nombra el lado del cuadro dentro de una frase corrida («Elisa, **a la izquierda**»). */
const EN_EL_LADO: Record<MiembroReparto["lado"], string> = {
  izquierda: "a la izquierda",
  derecha: "a la derecha",
};

/** Adónde mira, dicho en una frase corrida. `camara` es lo de siempre: mira a quien lo está viendo. */
const MIRANDO: Record<MiembroReparto["mirada"], string> = {
  camara: "mirando a cámara",
  izquierda: "mirando hacia la izquierda",
  derecha: "mirando hacia la derecha",
};

/** Un turno, tal como se lee en la previsualización: quién, qué dice literal y con qué dirección vocal. */
export function textoDelTurno(turno: TurnoReparto): string {
  const direccion = turno.direccion.trim();
  return `${turno.orden}. ${turno.nombre}: «${turno.texto}»${direccion === "" ? "" : ` (${direccion})`}`;
}

/**
 * **Lo que se ha pedido**, en frases sueltas y en castellano. Una escena de un personaje devuelve la lista vacía:
 * ahí no hay nada que previsualizar que no estuviera ya en la pantalla de siempre.
 */
export function frasesDeLoPedido(reparto: RepartoVista): string[] {
  if (reparto.formato === "solo" || reparto.miembros.length === 0) return [];
  const [primero, segundo] = reparto.miembros;
  if (!primero) return [];
  if (reparto.formato === "dualcast") {
    const frases = [
      segundo
        ? `Los dos en el mismo plano: ${primero.nombre} ${EN_EL_LADO[primero.lado]} y ${segundo.nombre} ${EN_EL_LADO[segundo.lado]}.`
        : `Un solo plano con ${primero.nombre} ${EN_EL_LADO[primero.lado]}. Todavía falta el segundo personaje.`,
    ];
    const conTurnos = reparto.turnos.length > 0;
    const hablan = reparto.miembros
      .filter((m) => (conTurnos ? reparto.turnos.some((t) => t.personajeId === m.personajeId) : m.papel === "hablante"))
      .map((m) => m.nombre);
    const escuchan = reparto.miembros
      .filter((m) =>
        conTurnos ? !reparto.turnos.some((t) => t.personajeId === m.personajeId) : m.papel === "acompanante",
      )
      .map((m) => m.nombre);
    if (hablan.length > 0) {
      frases.push(
        escuchan.length > 0
          ? `Habla ${hablan.join(" y ")}; ${escuchan.join(" y ")} escucha y reacciona sin hablar.`
          : `Hablan ${hablan.join(" y ")}, por turnos.`,
      );
    }
    return [...frases, ...reparto.turnos.map(textoDelTurno)];
  }
  return [
    `Dos clips del mismo set, uno por personaje, y en ninguno sale el otro.`,
    ...reparto.miembros.map((miembro, indice) => {
      const otro = reparto.miembros.find((m) => m.personajeId !== miembro.personajeId);
      const turnos = reparto.turnos.filter((t) => t.personajeId === miembro.personajeId).length;
      const donde = otro ? `, donde estaría ${otro.nombre}` : "";
      return `Clip ${indice + 1}: ${miembro.nombre}, ${EN_EL_LADO[miembro.lado]} del plano, ${MIRANDO[miembro.mirada]}${donde}. ${turnos === 0 ? "No dice nada: solo escucha." : `Dice ${turnos} ${turnos === 1 ? "turno" : "turnos"}.`}`;
    }),
    ...reparto.turnos.map(textoDelTurno),
  ];
}

// ── Formatos apagados por quien administra ────────────────────────────────────────────────────────────────

/** Estado de los dos interruptores de Admin › Ajustes › Dos personajes. */
export interface FormatosActivos {
  podcastActivo: boolean;
  dualcastActivo: boolean;
}

/** `true` cuando ese formato se puede elegir en esta instalación. `solo` siempre se puede. */
export const formatoDisponible = (formato: FormatoReparto, activos: FormatosActivos): boolean =>
  formato === "solo" || (formato === "podcast" ? activos.podcastActivo : activos.dualcastActivo);

/**
 * Por qué no se puede elegir ese formato ahora mismo, **con quién lo enciende**. `null` cuando sí se puede: un
 * formato apagado se explica en una frase en lugar de desaparecer sin decir nada.
 */
export function motivoFormatoApagado(formato: FormatoReparto, activos: FormatosActivos): string | null {
  if (formatoDisponible(formato, activos)) return null;
  return `«${ETIQUETA_FORMATO_REPARTO[formato]}» está apagado en esta instalación. Lo enciende quien la administra en Admin › Ajustes › Dos personajes.`;
}

// ── Consentimiento, persona a persona ─────────────────────────────────────────────────────────────────────

/** Un personaje del reparto con lo que le falta, tal como llega del servidor. */
export interface PersonajeDeLaPantalla {
  nombre: string;
  inventado: boolean;
  impedimentos: string[];
}

/**
 * **A quién le falta algo y qué le falta**, por su nombre. Es lo que se pinta en la zona de claridad del
 * consentimiento: con dos personas reales hacen falta **dos** consentimientos, y decir «falta un consentimiento»
 * sin decir de quién obliga a adivinar.
 */
export function faltasDelReparto(personajes: readonly PersonajeDeLaPantalla[]): string[] {
  return personajes
    .filter((p) => p.impedimentos.length > 0)
    .map((p) => `A «${p.nombre}» le falta: ${p.impedimentos.join(" ")}`);
}

/** `true` cuando todos los del reparto están en orden y se puede generar por lo que toca al consentimiento. */
export const repartoConsentido = (personajes: readonly PersonajeDeLaPantalla[]): boolean =>
  personajes.every((p) => p.impedimentos.length === 0);

// ── Avisos que se confirman antes de pagar ────────────────────────────────────────────────────────────────

/**
 * Los avisos **confirmables** del reparto, con la misma regla con la que el motor de controles los va a pedir
 * (`controles/motor.ts`): sin la regla exacta, la casilla que marca el usuario no desbloquea nada en el servidor.
 *
 * Son avisos y no frenos a propósito: dos voces iguales, un diálogo sin repartir o unos turnos que no caben en la
 * duración son decisiones del usuario, no errores. Lo que no se puede es cobrárselos sin habérselo dicho.
 */
export function avisosDelReparto(
  reparto: RepartoVista,
  estimacion: { avisos: readonly string[] } | null,
): { regla: string; motivo: string }[] {
  if (reparto.formato === "solo") return [];
  const avisos: { regla: string; motivo: string }[] = [];
  if (reparto.mismaVoz) {
    avisos.push({
      regla: "reparto-misma-voz",
      motivo:
        "Los dos personajes usan la voz Omni registrada del proyecto, así que la conversación sonará con el mismo timbre. Este formato todavía no admite dos voces Omni distintas.",
    });
  }
  if (reparto.turnos.length === 0) {
    avisos.push({
      regla: "reparto-sin-turnos",
      motivo:
        "El diálogo de esta escena no está repartido por turnos, así que el modelo decidirá quién dice cada frase.",
    });
  }
  // El texto del aviso del diálogo largo lo escribe el servidor con las palabras y los segundos medidos.
  const largo = (estimacion?.avisos ?? []).find((aviso) => aviso.includes("se va a cortar a media frase"));
  if (largo) avisos.push({ regla: "reparto-dialogo-largo", motivo: largo });
  return avisos;
}

// ── Dinero ────────────────────────────────────────────────────────────────────────────────────────────────

/** Lo mínimo de la estimación que la pantalla necesita para poder contar el total sin recalcular nada. */
export interface EstimacionDeLaPantalla {
  formato: FormatoReparto;
  clips: readonly { orden: number; nombre: string; creditos: number; turnos: number; palabras: number }[];
  creditos: number;
  comprobado: string;
}

/** Una fecha `AAAA-MM-DD` del catálogo, escrita como se lee en España. Vacía si no se sabe de cuándo es. */
export function fechaDelPrecio(comprobado: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(comprobado.trim());
  if (!partes) return "";
  return `${partes[3]}/${partes[2]}/${partes[1]}`;
}

/**
 * Detalle del total: **cuántos clips se pagan y de cuándo es el precio**. Va debajo de la cifra, que siempre se
 * enseña con la palabra «estimación»: lo que se cobra lo decide el proveedor.
 */
export function detalleDeLaEstimacion(estimacion: EstimacionDeLaPantalla): string {
  const clips = estimacion.clips.length;
  const cuantos = `${clips} ${clips === 1 ? "clip" : "clips"}`;
  const formato = estimacion.formato === "podcast" ? "podcast: un clip por personaje" : "un solo plano con los dos";
  const fecha = fechaDelPrecio(estimacion.comprobado);
  return `${cuantos} (${formato})${fecha === "" ? "" : `, con el precio comprobado el ${fecha}`}.`;
}
