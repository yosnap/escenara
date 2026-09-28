import {
  type FormatoClip,
  formatoHabla,
  type MomentoMicroaccion,
  NOMBRE_FORMATO_CLIP,
  NOMBRE_MOMENTO_MICROACCION,
} from "@/lib/direccion";

/**
 * **Fidelidad de la dirección**: lo que se le enseña a Jev para que decida si el clip hace lo que se pidió.
 *
 * Jev **solo lee texto**, así que lo que compara son dos descripciones: los hechos que un modelo de percepción
 * vio en el clip, y esto, que es lo que el usuario dirigió. Y lo que se le enseña **no es el prompt** (ADR-0022,
 * igual que en `coherencia/escena.ts`): es la elección del usuario. Si Jev comparara contra el prompt, mediría
 * si el proveedor obedeció al servidor; lo que interesa medir es si el usuario ha recibido lo que pidió.
 *
 * Por eso los valores van con las **etiquetas en castellano** del catálogo, que son exactamente las que el
 * usuario pulsó, y no con el fragmento en inglés que se envió.
 *
 * Nace **en sombra** (decisión del propietario para la 0.24.0, que esta versión hereda): se registra con su
 * evidencia, no bloquea nada y se mide su acierto antes de darle poder.
 */

/** Lo que el usuario dirigió, escrito como lo eligió. Vacío = no eligió, que también es información. */
export interface DireccionPedida {
  formato: FormatoClip;
  /** Nombres en castellano del catálogo, tal como aparecen en el botón que pulsó. */
  plano: string;
  angulo: string;
  movimientoCamara: string;
  microaccion: string;
  momentoMicroaccion: MomentoMicroaccion;
}

/**
 * La dirección convertida en el estado que recibe Jev. Es un objeto de campos y no una frase montada: Jev
 * acepta objetos, y mandarlo estructurado evita que el propio formato del texto sugiera una respuesta.
 *
 * Las claves van en inglés porque van con la pregunta, que va en inglés; los **valores** son lo que el usuario
 * eligió, en castellano, que es lo que él puede reconocer si le enseñamos la evidencia.
 */
export function pedidoDeDireccion(direccion: DireccionPedida): Record<string, string> {
  const habla = formatoHabla(direccion.formato);
  const sinElegir = "sin elegir";
  return {
    clip_format: NOMBRE_FORMATO_CLIP[direccion.formato],
    character_speaks: habla ? "sí" : "no: es un clip mudo, con la boca cerrada y sin voz",
    shot_size: direccion.plano.trim() || sinElegir,
    camera_angle: direccion.angulo.trim() || sinElegir,
    // «Sin movimiento» no es lo mismo que «sin elegir»: quieta es una elección y se mide como tal.
    camera_movement: direccion.movimientoCamara.trim() || "la cámara se queda quieta",
    micro_action: direccion.microaccion.trim() || "ninguna",
    micro_action_timing:
      direccion.microaccion.trim() === ""
        ? "no aplica"
        : NOMBRE_MOMENTO_MICROACCION[direccion.momentoMicroaccion].toLowerCase(),
    single_take: "sí: una sola toma continua, sin ningún corte",
  };
}

/**
 * Resumen en castellano de lo dirigido, para enseñárselo al usuario **antes** de generar. Es la
 * previsualización de la pantalla de escena: lo que ha pedido, no el prompt.
 */
export function resumirDireccion(direccion: DireccionPedida): string {
  const partes = [
    NOMBRE_FORMATO_CLIP[direccion.formato],
    direccion.plano.trim(),
    direccion.angulo.trim(),
    direccion.movimientoCamara.trim() || "cámara quieta",
    direccion.microaccion.trim() === ""
      ? ""
      : `${direccion.microaccion.trim()} (${NOMBRE_MOMENTO_MICROACCION[direccion.momentoMicroaccion].toLowerCase()})`,
    formatoHabla(direccion.formato) ? "" : "sin voz",
  ].filter((parte) => parte !== "");
  return `${partes.join(" · ")}. Una sola toma, sin cortes.`;
}
