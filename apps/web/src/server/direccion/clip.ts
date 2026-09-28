import {
  type Acento,
  AVISO_DOS_MOVIMIENTOS,
  AVISO_GESTO_ANTES_POCO_FIABLE,
  AVISO_GUION_EN_BROLL_DE_PRODUCTO,
  AVISO_GUION_EN_CLIP_MUDO,
  AVISO_MOVIMIENTO_AVANZADO,
  avisoGestoNoCabe,
  type EjesVoz,
  type FormatoClip,
  formatoHabla,
  gestoNoCabe,
  type MomentoMicroaccion,
  type NivelCamara,
  type RegistroEstetico,
} from "@/lib/direccion";
import { AVISO_GUION_EN_ACCION_SIN_HABLA } from "@/lib/productos";
import {
  ACENTO_INGLES,
  ANCLAJES_REALISMO,
  ejesVozEnIngles,
  FORMATO_CLIP_INGLES,
  MODO_MUDO,
  REGISTRO_CAMARA_INGLES,
  REGLA_ANTI_CORTE,
  SIN_HABLA_EN_ACCION,
  SIN_RETOQUE_FINAL,
} from "./ingles";
import {
  accionSinHabla,
  bloqueProducto,
  type ProductoEnPrompt,
  REGLA_ETIQUETA_PRODUCTO,
  sustituyeAlSujeto,
} from "./producto";

/**
 * **Compositor de la dirección del clip**: convierte lo que el usuario ha elegido con botones en el texto que se
 * le envía al modelo de vídeo.
 *
 * Sustituye a la cámara cableada de la plantilla `clip-social`, que ponía `Camera: steady, with a subtle
 * handheld feel.` en todos los clips de todos los proyectos.
 *
 * **El orden importa y es el producto.** Los modelos de vídeo leen el prompt como un guion técnico y respetan
 * lo que va antes mejor que lo que va después (guía de cinematografía de Veo; «un solo movimiento por plano» de
 * Kling). El orden es:
 *
 * 1. **encuadre y cámara** — plano, ángulo, movimiento y look de la toma;
 * 2. **sujeto y escena** — quién sale y dónde;
 * 3. **micro-acción `antes`** — el gesto que precede a la frase;
 * 4. **guion** — el diálogo literal, entre comillas y **sin traducir**;
 * 5. **micro-acción `durante` o `despues`** — el gesto que acompaña o sigue a la frase;
 * 6. **voz y acento** — cómo suena quien habla;
 * 7. **regla anti-corte** — siempre, la última.
 *
 * El **producto** (0.26.0) entra en dos sitios de ese orden y no en uno: qué se ve y qué se hace con él van
 * **con el sujeto**, porque es parte de quién y qué sale en el plano; y la regla de que su etiqueta no se toca
 * va al final, justo antes de la toma única, por lo mismo que la regla de no retoque de una persona real: lo
 * último es lo que mejor se obedece, y ningún fragmento de catálogo puede quedar por delante y contradecirla.
 * La toma única **sigue siendo la última**: eso no lo mueve nada.
 *
 * Orden provisional hasta que lo confirme el spike de bajo coste (paso 1 de la fase): está pendiente de la
 * aprobación del propietario porque comprobarlo cuesta generaciones reales.
 *
 * Todo lo que sale de aquí va **en inglés menos el diálogo**, y nada de esto se le enseña al usuario que no sea
 * admin (ADR-0022): él ve su elección escrita en castellano, que es lo que puede reconocer.
 */

/** Lo que el usuario ha dirigido, ya resuelto a trozos de prompt en inglés. */
export interface DireccionDeClip {
  formato: FormatoClip;
  /**
   * Movimientos de cámara elegidos, ya traducidos por el catálogo. Se admite recibir más de uno **para poder
   * avisar**: al prompt solo va el primero.
   */
  movimientosCamara: readonly string[];
  nivelCamara: NivelCamara;
  /** Plano (C2): general, medio, primer plano… Vacío si el usuario no ha elegido. */
  plano: string;
  /** Ángulo (C2): frente, picado, contrapicado… Vacío si no ha elegido. */
  angulo: string;
  registroEstetico: RegistroEstetico;
  /** Quién sale, en inglés. Con personaje real es la cita de sus referencias, nunca adjetivos de atractivo. */
  sujeto: string;
  /**
   * `true` si el sujeto es una **persona real**. Con `true` se repite la regla de no retoque al cerrar, después
   * de todo el texto del catálogo: un fragmento de preset redactado por alguien no puede quedar por delante de
   * ella y contradecirla.
   */
  personajeReal: boolean;
  /** Lo que se ve, escrito por el usuario y ya traducido al inglés (`prompts/traduccion.ts`). */
  escena: string;
  /**
   * Lo que el usuario ha añadido por escrito, ya traducido al inglés. **Se suma** a lo elegido con botones y va
   * en su sitio: pegado a la descripción de la escena, detrás del sujeto y delante del gesto. No quita nada.
   */
  instruccionesExtra: string;
  /**
   * `true` cuando manda {@link descripcionExperta} y los botones de dirección **no se aplican**. Lo que sigue
   * aplicándose siempre: la toma única, los anclajes y, con una persona real, la prohibición de retocarla.
   */
  modoExperto: boolean;
  /** La descripción entera escrita por el usuario, ya traducida al inglés. Solo se usa con `modoExperto`. */
  descripcionExperta: string;
  /**
   * Bloque de anclajes de realismo del catálogo (C6). En el clip normal no hace falta —el fotograma del que sale
   * ya viene anclado y el catálogo pone su parte con el registro estético—, pero en modo experto no queda
   * ninguna descripción del sistema, así que los anclajes se ponen aquí: el usuario no puede quitarlos.
   */
  anclajes: string;
  /** Gesto del catálogo, ya en inglés. Vacío = ninguno. */
  microaccion: string;
  momentoMicroaccion: MomentoMicroaccion;
  /** Lo que dice el personaje, **literal y sin traducir**. Vacío = no habla. */
  dialogo: string;
  /** Dirección vocal corta del usuario, ya traducida al inglés. Vacía si no ha escrito ninguna. */
  direccionVocal: string;
  ejesVoz: EjesVoz;
  acento: Acento;
  /**
   * Duración del clip en segundos. Decide si el gesto cabe fuera del diálogo: con una frase que ocupa todo el
   * clip no hay hueco para asentir antes ni después, y prometerlo sería prometer algo que no puede pasar
   * (medido en el spike del 2026-09-28).
   */
  segundos: number;
  /**
   * El producto que se presenta en el clip, ya resuelto a inglés (0.26.0). `null` = ninguno, que es lo normal.
   *
   * Con la acción de b-roll el producto **sustituye al sujeto**: no sale nadie y el clip va mudo aunque el
   * formato diga otra cosa, porque no hay quien hable.
   */
  producto?: ProductoEnPrompt | null;
}

/** Lo compuesto, con lo que hay que contarle al usuario antes de que pague. */
export interface ClipDirigido {
  /**
   * Descripción de la escena en inglés, ya dirigida. Es lo que entra donde antes entraba `action`: el prompt
   * final lo cierra el modelo (`kie/modelos.ts`) con sus negativos y su audio.
   */
  escena: string;
  /** Diálogo que se le pasa al modelo. **Vacío en formato mudo**, aunque el guion tenga texto. */
  dialogo: string;
  /** Avisos en castellano, para enseñarlos antes de generar. Vacío = nada que decir. */
  avisos: string[];
}

/** Junta frases sueltas en un párrafo, quitando las vacías y cerrando cada una con su punto. */
function parrafo(partes: readonly string[]): string {
  return partes
    .map((parte) => parte.trim())
    .filter((parte) => parte !== "")
    .map((parte) => (/[.!?]$/.test(parte) ? parte : `${parte}.`))
    .join(" ");
}

/** Bloque 1: encuadre, ángulo, movimiento y look de la toma. Va primero porque es lo que más se respeta. */
function bloqueCamara(direccion: DireccionDeClip): string {
  const movimiento = direccion.movimientosCamara[0]?.trim() ?? "";
  return parrafo([
    FORMATO_CLIP_INGLES[direccion.formato],
    direccion.plano,
    direccion.angulo,
    // Sin movimiento elegido la cámara se queda quieta, y se dice: callarlo deja al modelo inventando un travelling.
    movimiento === "" ? "The camera stays locked off and does not move" : movimiento,
    REGISTRO_CAMARA_INGLES[direccion.registroEstetico],
  ]);
}

/** Bloque 6: cómo suena quien habla. Solo existe si habla. */
function bloqueVoz(direccion: DireccionDeClip): string {
  const rasgos = ejesVozEnIngles(direccion.ejesVoz).filter((rasgo) => rasgo !== "");
  return parrafo([
    `The voice is ${rasgos.join(", ")}`,
    `The character is ${ACENTO_INGLES[direccion.acento]}`,
    direccion.direccionVocal,
  ]);
}

/** Anclajes del clip: los del catálogo de quien administra y, si no hay, los del código. Nunca vacío. */
const anclajesDelClip = (direccion: DireccionDeClip): string =>
  direccion.anclajes.trim() === "" ? ANCLAJES_REALISMO : direccion.anclajes.trim();

export interface OpcionesDeDireccion {
  /**
   * Escribe el diálogo **dentro** del texto de la escena, para los modelos cuya entrada no tiene un hueco
   * aparte donde ponerlo. Con Omni y con Veo se deja en `false`: sus constructores ya colocan la frase en su
   * sitio con la convención medida (`kie/modelos.ts`), y ponerla dos veces la haría repetirse.
   *
   * Se conserva la misma forma en los dos caminos: el idioma delante y la frase **literal entre comillas**, que
   * es lo que hace que el modelo la diga exacta en lugar de parafrasearla.
   */
  dialogoDentro?: boolean;
}

/**
 * Compone la dirección de un clip. Es una función **pura**: no lee la base de datos, no llama a nadie y no
 * cuesta nada, así que se puede probar entera sin simular un proveedor.
 */
export function dirigirClip(direccion: DireccionDeClip, opciones: OpcionesDeDireccion = {}): ClipDirigido {
  const avisos: string[] = [];
  const experto = direccion.modoExperto && direccion.descripcionExperta.trim() !== "";
  // En modo experto los botones no se envían, así que avisar de su nivel o de dos movimientos sería mentir.
  if (!experto) {
    if (direccion.movimientosCamara.filter((m) => m.trim() !== "").length > 1) avisos.push(AVISO_DOS_MOVIMIENTOS);
    if (direccion.nivelCamara === "avanzado") avisos.push(AVISO_MOVIMIENTO_AVANZADO);
  }

  const producto = direccion.producto ?? null;
  /**
   * El b-roll del producto no tiene quien hable: no sale nadie en el plano. Sale mudo aunque el formato del
   * clip diga «a cámara», y el guion escrito **no viaja**, igual que en la voz en off.
   */
  const soloProducto = sustituyeAlSujeto(producto);
  /**
   * **Acciones de producto sin habla** (0.26.0): una pasarela, un giro de 360 o una crema que se extiende son
   * planos visuales y quien sale no está diciendo nada. El clip va mudo aunque el formato sea «a cámara», y el
   * guion escrito no se envía, exactamente igual que en la voz en off y en el b-roll.
   */
  const visualSinHabla = accionSinHabla(producto);
  const habla = formatoHabla(direccion.formato) && !soloProducto && !visualSinHabla;
  const dialogo = habla ? direccion.dialogo.trim() : "";
  if (!habla && direccion.dialogo.trim() !== "") {
    avisos.push(
      soloProducto
        ? AVISO_GUION_EN_BROLL_DE_PRODUCTO
        : visualSinHabla
          ? AVISO_GUION_EN_ACCION_SIN_HABLA
          : AVISO_GUION_EN_CLIP_MUDO,
    );
  }

  // En el b-roll no hay nadie que pueda gesticular: el gesto elegido no se envía.
  const gesto = experto || soloProducto ? "" : direccion.microaccion.trim();
  // Si la frase llena el clip, el gesto se queda **dentro** del habla: es lo único que cabe, y se dice.
  const palabras = dialogo === "" ? 0 : dialogo.split(/\s+/).filter(Boolean).length;
  const apretado =
    gesto !== "" && direccion.momentoMicroaccion !== "durante" && gestoNoCabe(palabras, direccion.segundos);
  if (apretado) avisos.push(avisoGestoNoCabe(direccion.segundos));
  // Medido: el «antes» no se respeta ni con hueco de sobra. Se avisa, pero se envía lo que pidió el usuario.
  if (gesto !== "" && direccion.momentoMicroaccion === "antes" && !apretado) {
    avisos.push(AVISO_GESTO_ANTES_POCO_FIABLE);
  }
  const momento = apretado ? "durante" : direccion.momentoMicroaccion;
  const gestoAntes = gesto !== "" && momento === "antes" ? gesto : "";
  const gestoDespues = gesto !== "" && momento !== "antes" ? gesto : "";

  const escena = [
    // En modo experto no hay bloque de cámara: lo que describe el plano es el texto del usuario.
    experto ? "" : bloqueCamara(direccion),
    /**
     * El sujeto va siempre, también en modo experto: es donde viven las reglas de persona real (identidad de
     * las referencias, nada de embellecer). El usuario describe el plano, no a quién sale en él.
     *
     * Las instrucciones adicionales van **aquí**, justo detrás de lo que se ve y delante del gesto: es su sitio
     * en el guion técnico, y así se suman a la escena en lugar de competir con la cámara ni con la voz.
     */
    parrafo([
      // En el b-roll no sale nadie: el sujeto **es** el producto, y dejar aquí la descripción del personaje
      // metería a una persona en un plano que se pidió sin ninguna.
      soloProducto ? "" : direccion.sujeto,
      experto ? direccion.descripcionExperta : direccion.escena,
      experto ? "" : direccion.instruccionesExtra,
    ]),
    // El producto va con el sujeto: es parte de qué sale en el plano, y trae pegada la acción que se eligió.
    producto ? bloqueProducto(producto) : "",
    // El gesto previo va **delante** del diálogo: el modelo lo ejecuta antes de abrir la boca.
    parrafo([gestoAntes]),
    // El diálogo, cuando el constructor del modelo no lo coloca él (`kie/modelos.ts › promptEscenaHablada`).
    opciones.dialogoDentro && dialogo !== "" ? `The character says, in Spanish, exactly: "${dialogo}"` : "",
    parrafo([gestoDespues]),
    // Sin habla se describe lo que se ve y el ambiente **en positivo**: a estos modelos no se les prohíbe el
    // audio, porque prohibírselo es lo que les hace fallar (medido el 2026-09-28).
    habla ? bloqueVoz(direccion) : visualSinHabla ? SIN_HABLA_EN_ACCION : MODO_MUDO,
    // Los anclajes cierran el modo experto: sin ellos, una descripción escrita entera por el usuario saldría sin
    // nada que pida piel de verdad ni anatomía correcta, y eso no es suyo para quitarlo.
    experto ? anclajesDelClip(direccion) : "",
    // La etiqueta del producto va después del catálogo y antes de la toma única: lo último se obedece mejor, y
    // la toma única no se mueve de la última posición.
    producto ? REGLA_ETIQUETA_PRODUCTO : "",
    // En el b-roll no hay persona a la que no retocar: la regla habla de alguien que no está en el plano.
    direccion.personajeReal && !soloProducto ? SIN_RETOQUE_FINAL : "",
    REGLA_ANTI_CORTE,
  ]
    .filter((bloque) => bloque !== "")
    .join("\n");

  return { escena, dialogo, avisos };
}

/**
 * Familias de modelo que esta versión sabe dirigir, y si su constructor de entrada coloca él el diálogo.
 *
 * No es una lista de modelos: es una propiedad del **constructor** de cada familia (`kie/entradas.ts`), igual
 * que `MODELOS_OMNI` dice para cuáles sabe montar la entrada esta instalación y no cuáles existen.
 */
export const FAMILIAS_DIRIGIBLES = ["omni", "veo", "generica"] as const;
export type FamiliaDirigible = (typeof FAMILIAS_DIRIGIBLES)[number];

const DIALOGO_DENTRO_POR_FAMILIA: Record<FamiliaDirigible, boolean> = {
  // Omni pone la frase con `saying in Spanish: "…"`, medido el 2026-09-28.
  omni: false,
  // Veo la pone al principio, con dos puntos y sin comillas, medido el 2026-09-27.
  veo: false,
  // El resto no separa escena y diálogo: la frase tiene que ir escrita dentro del texto.
  generica: true,
};

/**
 * A qué familia pertenece un modelo del catálogo. Se mira el identificador porque es lo que decide qué
 * constructor de entrada se va a usar (`kie/entradas.ts`), que es justo lo que hay que saber.
 */
export function familiaDe(modelo: string): FamiliaDirigible {
  const id = modelo.toLowerCase();
  if (id.includes("omni")) return "omni";
  if (id.includes("veo")) return "veo";
  return "generica";
}

/** Dirige un clip para la familia de modelo que lo va a generar. Es el punto de entrada de la producción. */
export const dirigirClipPara = (familia: FamiliaDirigible, direccion: DireccionDeClip): ClipDirigido =>
  dirigirClip(direccion, { dialogoDentro: DIALOGO_DENTRO_POR_FAMILIA[familia] });
