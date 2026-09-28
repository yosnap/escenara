import { sql } from "drizzle-orm";
import { type Comprobacion, esModoCoherencia, type ModoCoherencia, UMBRAL_POR_DEFECTO } from "@/lib/coherencia";
import { db } from "./db/cliente";
import { settings } from "./db/esquema";

/**
 * Ajustes de la instalación, editables en Admin › Ajustes (norma: la configuración vive en el panel,
 * no en variables de entorno). Cada ajuste tiene valor por defecto y validación; en la base de datos solo
 * se guardan los que el administrador cambia.
 */
export interface Ajustes {
  /** Si es falso, solo se puede crear la primera cuenta (la del administrador). */
  registroAbierto: boolean;
  /** Espacio máximo por usuario en MB; 0 = sin límite. El administrador no tiene límite. */
  cuotaMb: number;
  /** Créditos estimados por encima de los cuales un trabajo exige un aviso extra antes de gastar. */
  avisoCreditos: number;
  /**
   * Cambio aproximado de crédito a euros, **por proveedor** (0.21.1). Un crédito de KIE y uno de ElevenLabs no
   * valen lo mismo y nunca debieron compartir una cifra: mezclarlos daba un número que no significaba nada.
   * Solo sirve para mostrar la estimación en euros; lo que manda en los topes son los créditos de cada proveedor.
   *
   * Los proveedores que se pagan por cuota del plan (`compatible`) y lo que se hace en la propia máquina
   * (`local`) cuentan **0 €**: su llamada no tiene precio por petición, así que inventarle uno sería mentir.
   */
  eurosPorCreditoKie: number;
  eurosPorCreditoGoogle: number;
  eurosPorCreditoElevenlabs: number;
  /**
   * Créditos que cada usuario tiene autorizados a comprometer en Escenara (reservados + consumidos);
   * 0 = sin presupuesto propio, manda solo el saldo del proveedor. No es dinero de Escenara: es el tope
   * que esta instalación autoriza a gastar en la cuenta del propio usuario.
   */
  presupuestoCreditos: number;
  /** Tope de créditos por trabajo; 0 = sin tope por trabajo. */
  presupuestoTrabajo: number;
  /** Trabajos simultáneos por usuario en la cola (en cola, preparando, enviados o en curso). */
  trabajosSimultaneos: number;
  /**
   * Escenas de proyecto que un usuario puede tener **en vuelo** a la vez (RF06, 0.19.0). Una escena está en vuelo
   * mientras su fotograma o su clip siguen en la cola o en el proveedor.
   *
   * Es un tope **aparte** del de trabajos simultáneos y más estricto a propósito: una escena cuesta dos trabajos
   * (fotograma y clip), así que producir un proyecto de diez escenas de golpe sería comprometer diez veces el
   * coste de una antes de que el usuario haya visto ni un fotograma. Por defecto 2 (decisión provisional del
   * propietario, 2026-09-27): acota el gasto y el riesgo sin que la producción se haga eterna.
   */
  escenasEnVuelo: number;
  /**
   * Presupuesto en créditos que se propone al crear un proyecto (RF14, 0.17.0). Es solo la propuesta: quien
   * crea el proyecto la puede subir o bajar, y sin presupuesto fijado el plan no se puede aprobar.
   */
  presupuestoProyecto: number;
  /**
   * Asistente de guion encendido (0.17.0). **Apagado de fábrica**: escribir el guion a mano es un camino de
   * primera clase y el asistente cuesta dinero, así que se enciende a propósito. Aunque esté encendido, hace
   * falta además un modelo de texto utilizable en el catálogo y la clave del proveedor del usuario.
   */
  asistenteActivo: boolean;
  /**
   * Margen prudente que se suma a la estimación de una escena cuando su modelo no tiene precio **medido**
   * (solo documentado), en % (ADR-0009: el prototipo infraestimó ×3). Siempre se dice en la interfaz.
   */
  asistenteMargenEstimacion: number;
  /**
   * Traducir al inglés lo que el usuario escribe en español **antes de componer el prompt** (decisión firme del
   * propietario, 2026-09-27). Es una llamada de pago al modelo de texto, así que viene **apagada**: mientras ese
   * modelo esté `descubierto` en el catálogo, encenderla es una decisión con coste. Apagada se envía el texto
   * original, como hasta la 0.16.x. El diálogo hablado no se traduce nunca.
   */
  traducirPrompts: boolean;
  /**
   * Días que se guarda una traducción sin usarse antes de que el barrido la borre. La caché existe para no pagar
   * dos veces lo mismo, no para guardar texto de alguien indefinidamente: 0 la desactiva (se purga en cada pasada).
   */
  traduccionDiasCache: number;
  /**
   * Mostrar al usuario el prompt compuesto. **Apagado y preparado para el futuro** (planes de pago): desde la
   * 0.17.0 el prompt final es material del panel de administración y no sale hacia el navegador de un usuario
   * normal (ADR-0022).
   */
  mostrarPromptAlUsuario: boolean;
  /**
   * Parámetros del motor de controles previos (RF12, 0.18.0). Las **reglas viven en el código**
   * (`server/controles/motor.ts`, deterministas y puras) y aquí solo se ajustan sus umbrales: no hay editor
   * de reglas en la interfaz (decisión provisional del propietario, 2026-09-27).
   *
   * Estos tres solo gobiernan avisos **salvables**. Los frenos duros (credencial, consentimiento, formato,
   * presupuesto) no son configurables a propósito: se apagan cambiando el código y revisándolo, no desde un
   * panel.
   */
  /** Avisar cuando falten vistas mínimas del personaje o alguna foto la haya señalado el control de calidad. */
  controlesExigirCoberturaVistas: boolean;
  /** Avisar cuando el precio del modelo se comprobó hace más de 90 días: la estimación puede quedarse corta. */
  controlesExigirPrecioFresco: boolean;
  /**
   * Avisos salvables que se pueden confirmar de una vez. Pasado ese número hay que arreglar algo: una pantalla
   * con seis casillas de «sé lo que hago» no es una confirmación informada, es un trámite.
   */
  controlesMaximoAvisos: number;
  /**
   * Revisión de continuidad de las escenas producidas (RF07). Las comprobaciones técnicas **no cuestan nada** y
   * aquí solo se ajustan sus umbrales; qué fallo es crítico vive en el código (`lib/revision.ts`), porque es una
   * decisión de producto y no un umbral.
   */
  /** Diferencia de duración que se tolera frente a los segundos planificados, en segundos. */
  revisionToleranciaDuracion: number;
  /** Segundos de metraje negro o congelado que se toleran antes de avisar. */
  revisionSegundosPlanosMaximos: number;
  /**
   * Exigir que el clip lleve pista de audio. **Apagado de fábrica**: no todos los modelos de animación generan
   * voz, así que con esto apagado la revisión dice si hay audio pero no lo cuenta como fallo.
   */
  revisionExigirAudio: boolean;
  /**
   * Revisión multimodal de pago disponible. **Apagada de fábrica**: mirar un clip con un modelo cuesta créditos y
   * la identidad la valida siempre una persona, así que esto solo añade una opinión más. Aunque esté encendida,
   * cada revisión se estima y se confirma una por una: nunca se lanza sola.
   */
  revisionMultimodalActiva: boolean;
  /**
   * Coherencia con Jev (RF13, 0.24.0). Cada comprobación tiene **su modo** y **su umbral de confianza**: no hay
   * ninguna frontera universal, y el propio PRD (§9) avisa de que tomar la confianza por una tasa de acierto es
   * el error clásico.
   *
   * De fábrica: la identidad **activa** (su veredicto decide si una vista generada cubre) y las otras tres en
   * **sombra** (se registran con su evidencia y no bloquean nada), que es lo que el propietario decidió el
   * 2026-09-28 para poder medir su acierto antes de darles poder.
   */
  coherenciaIdentidad: ModoCoherencia;
  coherenciaGuion: ModoCoherencia;
  coherenciaResultado: ModoCoherencia;
  coherenciaEmocion: ModoCoherencia;
  /** Fidelidad de la dirección del clip (0.25.0). Nace en sombra: primero se mide, después decide. */
  coherenciaDireccionFiel: ModoCoherencia;
  /** Fidelidad del producto (0.26.0): la etiqueta y el envase no cambian. Nace en sombra. */
  coherenciaProductoFiel: ModoCoherencia;
  /**
   * Fidelidad al ángulo del anuncio (0.27.0): que el guion responda al ángulo del brief, no mezcle otros y diga
   * la oferta como se definió. Nace en **sombra** y pasa a decidir cuando haya datos de acierto (decisión del
   * propietario, 2026-09-28). Es texto contra texto: no gasta ninguna llamada de percepción.
   */
  coherenciaAnguloFiel: ModoCoherencia;
  /** Confianza mínima (0–1) para actuar. Por debajo, el veredicto es «míralo tú» y no decide nada. */
  coherenciaUmbralIdentidad: number;
  coherenciaUmbralGuion: number;
  coherenciaUmbralResultado: number;
  coherenciaUmbralEmocion: number;
  coherenciaUmbralDireccionFiel: number;
  coherenciaUmbralProductoFiel: number;
  coherenciaUmbralAnguloFiel: number;
  /**
   * Modelos de **percepción** que se prueban primero dentro del mapa del usuario: el de imagen describe la cara y
   * el encuadre, el omnimodal describe la voz y el ambiente. Si el usuario no los tiene dados de alta, se recorre
   * su mapa tal cual: aquí no se inventa ninguna entrada que él no haya añadido.
   */
  coherenciaModeloImagen: string;
  coherenciaModeloAudio: string;
  /**
   * Euros por millón de tokens de entrada de Jev, para poder decir lo que cuesta la comprobación. **0 de fábrica**:
   * lo paga la instalación con su propia clave y su tarifa la mide quien administra, igual que el cambio de
   * crédito a euros de cada proveedor. Con 0, el panel enseña los tokens y no un euro inventado.
   */
  coherenciaEurosPorMillonTokens: number;
  /**
   * Tope de decisiones de Jev por usuario en 24 horas. Jev lo paga la instalación con su clave, así que sin tope un
   * usuario podría gastar la cuenta del operador pulsando «Comprobar» en bucle.
   */
  coherenciaDecisionesPorDia: number;
  /**
   * **Estrategia del anuncio** (0.27.0): el brief (ángulo y oferta antes del guion) y las variantes por ángulo.
   *
   * Las dos **encendidas de fábrica**: no cuestan nada por sí mismas —el brief es un formulario y las variantes
   * crean proyectos, no clips— y son el camino que esta versión propone. Se apagan desde el panel si una
   * instalación prefiere el guion a mano, y apagarlas no borra ningún brief ya escrito.
   */
  anuncioBriefActivo: boolean;
  /**
   * Ofrecer crear variantes del mismo producto y oferta, una por ángulo. Depende del brief: sin brief no hay
   * ángulo del que variar, así que con `anuncioBriefActivo` apagado esto no ofrece nada aunque esté encendido.
   */
  anuncioVariantesActivas: boolean;
  /**
   * Voz y subtítulos (RF08, 0.21.0). **La voz se elige por proyecto**, no aquí: lo que se ajusta en el panel es
   * si esta instalación ofrece la pista de voz de pago y con qué transcriptor local trabaja.
   */
  /**
   * Ofrecer el modo «pista de voz aparte», que **cuesta créditos por escena**. Apagado de fábrica: el modo «voz
   * del clip» funciona sin gastar nada más y es el de fábrica de cada proyecto. Aunque esté encendido hace falta
   * además un modelo de voz utilizable **con precio medido** en el catálogo y la clave del proveedor del usuario:
   * sin precio no se estima y no se gasta.
   */
  vozTtsActivo: boolean;
  /**
   * Orden del transcriptor local, que es el que saca los subtítulos del audio (decisión provisional del
   * propietario, 2026-09-28: **local, sin coste y sin clave**). `whisper-cli` es el binario de `whisper.cpp`
   * (`brew install whisper-cpp`), el más sencillo de instalar en macOS y en Linux.
   *
   * Es una **dependencia del entorno**, igual que FFmpeg desde la 0.20.0: si falta, la pantalla lo dice con el
   * mensaje de instalación y no ofrece transcribir. No inventa subtítulos.
   */
  transcripcionBinario: string;
  /**
   * Ruta del fichero de modelo que usa ese binario (`ggml-base.bin` y similares). Vacía deja que el binario use
   * el suyo por defecto, si lo tiene. El modelo pequeño es el de fábrica: es el que cabe en un servidor modesto.
   */
  transcripcionModelo: string;
  /**
   * Fotos de referencia que un personaje necesita como mínimo para poder generar. Con menos, la identidad
   * se pierde entre fotogramas: en el prototipo del 2026-09-27 cinco fotos dieron buen resultado y tres son
   * el mínimo razonable. La cobertura guiada de vistas llega en 0.14.0.
   */
  minimoReferenciasPersonaje: number;
  /**
   * Umbrales del control de calidad de la captura guiada (0.14.0). Se miden en el servidor con el mismo
   * `sharp` que ya reduce las imágenes, **sin gastar un solo crédito**: la revisión con modelo llega en
   * 0.20.0.
   *
   * Todos avisan y se pueden saltar con «usar de todas formas», también `calidadLadoMinimo` desde el
   * 2026-09-28: una foto real recortada sigue siendo útil. Lo que no se salta es una foto enorme o repetida.
   */
  calidadLadoMinimo: number;
  /** Varianza del laplaciano mínima (escala 0–255). Por debajo, la foto está borrosa. */
  calidadNitidezMinima: number;
  /** Luminancia media mínima y máxima (0–255): fuera de la horquilla, la cara se pierde. */
  calidadLuminosidadMinima: number;
  calidadLuminosidadMaxima: number;
  /**
   * Proporción mínima que debe ocupar la cara, en % del lado menor. La mide el **navegador** con
   * `FaceDetector`, así que solo avisa donde existe; 0 la desactiva.
   */
  calidadCaraMinima: number;
  /**
   * URL pública de esta instalación. Con ella se activan los callbacks del proveedor; vacía, solo se usa
   * el sondeo del worker. El sondeo funciona siempre, con callbacks o sin ellos.
   */
  urlPublica: string;
  correoRemitente: string;
  smtpHost: string;
  smtpPuerto: number;
  /** TLS directo (puerto 465). Con `false` se usa STARTTLS si el servidor lo ofrece. */
  smtpSeguro: boolean;
  smtpUsuario: string;
  /** Cabeceras con la IP real que escribe el proxy propio (separadas por comas); vacío = `x-forwarded-for`. */
  cabecerasIp: string;
  /**
   * Identificadores de cliente OAuth. No son secretos (se envían al navegador en el propio flujo de
   * acceso); sus secretos van cifrados en la bóveda (`server/boveda/secretos.ts`).
   */
  googleClientId: string;
  githubClientId: string;
}

export const AJUSTES_POR_DEFECTO: Ajustes = {
  registroAbierto: true,
  cuotaMb: 2048,
  avisoCreditos: 200,
  // KIE vende 1.000 créditos por unos 5 USD (comprobado el 2026-09-27); se redondea al alza a propósito.
  eurosPorCreditoKie: 0.005,
  // Google y ElevenLabs aún no tienen tarifa medida en esta instalación: 0 € hasta que quien administra la mida.
  eurosPorCreditoGoogle: 0,
  eurosPorCreditoElevenlabs: 0,
  presupuestoCreditos: 2000,
  presupuestoTrabajo: 500,
  trabajosSimultaneos: 3,
  // Dos escenas en vuelo: cada una son dos trabajos, así que esto ya compromete hasta cuatro a la vez.
  escenasEnVuelo: 2,
  presupuestoProyecto: 500,
  // El asistente de guion arranca apagado: cuesta dinero y el guion a mano funciona igual de bien.
  asistenteActivo: false,
  asistenteMargenEstimacion: 30,
  // Traducir cuesta créditos y el modelo de texto aún no está validado: se enciende a propósito.
  traducirPrompts: false,
  traduccionDiasCache: 180,
  mostrarPromptAlUsuario: false,
  // El aviso de cobertura **viene apagado**: añade una confirmación a un flujo que ya funciona y solo tiene
  // sentido cuando la instalación usa la captura guiada de vistas (0.14.0) de verdad. Encenderlo es decidir que
  // a partir de ahora generar con un personaje sin todas sus vistas exige confirmarlo.
  controlesExigirCoberturaVistas: false,
  // El del precio viejo sí: no cuesta nada, no bloquea nada, y gastar con una tarifa de hace más de tres meses
  // es exactamente lo que el panel «Antes de generar» tiene que poder decir antes de gastar.
  controlesExigirPrecioFresco: true,
  controlesMaximoAvisos: 3,
  // Medio segundo: los clips de 4 s de KIE miden 4,0–4,1 s según el contenedor, así que una diferencia menor que
  // esto no es un formato incorrecto, es cómo se cierra un MP4.
  revisionToleranciaDuracion: 0.5,
  revisionSegundosPlanosMaximos: 0.5,
  // Apagado: los modelos de animación en uso no generan voz, así que exigir audio avisaría en cada escena.
  revisionExigirAudio: false,
  // Apagada: cuesta créditos y es una opinión, no un veredicto. Encenderla es decidir que se ofrece ese gasto.
  revisionMultimodalActiva: false,
  // La identidad decide (su veredicto es el que hace que una vista generada cubra); las otras tres registran y
  // no bloquean nada, para poder medir su acierto antes de darles poder (propietario, 2026-09-28).
  coherenciaIdentidad: "activa",
  coherenciaGuion: "sombra",
  coherenciaResultado: "sombra",
  coherenciaEmocion: "sombra",
  coherenciaDireccionFiel: "sombra",
  coherenciaProductoFiel: "sombra",
  coherenciaAnguloFiel: "sombra",
  coherenciaUmbralIdentidad: UMBRAL_POR_DEFECTO,
  coherenciaUmbralGuion: UMBRAL_POR_DEFECTO,
  coherenciaUmbralResultado: UMBRAL_POR_DEFECTO,
  coherenciaUmbralEmocion: UMBRAL_POR_DEFECTO,
  coherenciaUmbralDireccionFiel: UMBRAL_POR_DEFECTO,
  coherenciaUmbralProductoFiel: UMBRAL_POR_DEFECTO,
  coherenciaUmbralAnguloFiel: UMBRAL_POR_DEFECTO,
  // Los dos de NaN builders: `gemma4` es el más barato que ve, y `mimo-v2.5` es de los dos únicos que oyen.
  coherenciaModeloImagen: "gemma4",
  coherenciaModeloAudio: "mimo-v2.5",
  // Sin tarifa medida en esta instalación: 0 € hasta que quien administra la mida, como con el resto.
  coherenciaEurosPorMillonTokens: 0,
  coherenciaDecisionesPorDia: 60,
  // El brief y las variantes arrancan **encendidos**: no gastan nada y son el camino de esta versión.
  anuncioBriefActivo: true,
  anuncioVariantesActivas: true,
  // La pista de voz de pago arranca apagada: el modo «voz del clip» no gasta nada más y es el de fábrica.
  vozTtsActivo: false,
  transcripcionBinario: "whisper-cli",
  transcripcionModelo: "",
  minimoReferenciasPersonaje: 3,
  // 512 px de lado menor: por debajo, una cara ya no aporta identidad y el proveedor la amplía inventando.
  calidadLadoMinimo: 512,
  // Umbrales medidos el 2026-09-27 sobre fotos propias reducidas a 1920 × 1080: una foto de móvil bien
  // enfocada pasa de 40, una movida se queda por debajo de 8.
  calidadNitidezMinima: 8,
  calidadLuminosidadMinima: 45,
  calidadLuminosidadMaxima: 225,
  calidadCaraMinima: 12,
  urlPublica: "",
  correoRemitente: "Escenara <no-responder@escenara.local>",
  smtpHost: "localhost",
  smtpPuerto: 1021,
  smtpSeguro: false,
  smtpUsuario: "",
  cabecerasIp: "",
  googleClientId: "",
  githubClientId: "",
};

export class ErrorAjustes extends Error {
  constructor(
    readonly campo: keyof Ajustes,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorAjustes";
  }
}

const texto = (max: number) => (v: unknown) => typeof v === "string" && v.length <= max;
const entero = (min: number, max: number) => (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const booleano = (v: unknown) => typeof v === "boolean";
/** Número decimal positivo con cuatro decimales como mucho: un cambio de moneda, no un importe. */
const decimal = (min: number, max: number) => (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max && Math.round(v * 10_000) === v * 10_000;
/** URL pública de la instalación: `http://` o `https://` con host, sin credenciales ni consulta. Vacía la desactiva. */
function urlPublicaValida(v: unknown): boolean {
  if (typeof v !== "string" || v.length > 300) return false;
  if (v.trim() === "") return true;
  try {
    const url = new URL(v);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname !== "" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

// Identificador de cliente OAuth: solo los caracteres que usan Google y GitHub, o vacío para desactivarlo.
const idCliente = (v: unknown) => texto(300)(v) && /^[a-z0-9._~-]*$/i.test(v as string);

/**
 * Umbral de confianza: de 0,5 a 0,99. Por debajo de 0,5 no hay umbral que valga (la respuesta ya es más probable
 * que su contraria), y 1 exigiría una certeza que ningún modelo devuelve, así que nada pasaría nunca.
 */
const umbral = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0.5 && v <= 0.99 && Math.round(v * 100) === v * 100;

const MENSAJE_UMBRAL = "Indica la confianza mínima de 0,50 a 0,99, con dos decimales.";
const MENSAJE_MODO = "Elige «apagada», «sombra» o «activa».";
const MENSAJE_MODELO = "Escribe el identificador del modelo, sin espacios (por ejemplo «gemma4»).";

/** Identificador de modelo de un servicio compatible, con la misma forma que admite `lib/compatible.ts`. */
const identificadorModelo = (v: unknown) => texto(120)(v) && /^[\w.:@/-]*$/.test(v as string);

const VALIDACION: Record<keyof Ajustes, { valido: (v: unknown) => boolean; mensaje: string }> = {
  registroAbierto: { valido: booleano, mensaje: "Debe ser sí o no." },
  cuotaMb: { valido: entero(0, 10_000_000), mensaje: "Indica un número entero de MB (0 = sin límite)." },
  avisoCreditos: {
    valido: entero(0, 1_000_000),
    mensaje: "Indica un número entero de créditos (0 = avisar siempre).",
  },
  eurosPorCreditoKie: {
    valido: decimal(0, 100),
    mensaje: "Indica el precio de un crédito de KIE en euros, con cuatro decimales como mucho.",
  },
  eurosPorCreditoGoogle: {
    valido: decimal(0, 100),
    mensaje: "Indica el precio de un crédito de Google en euros, con cuatro decimales como mucho.",
  },
  eurosPorCreditoElevenlabs: {
    valido: decimal(0, 100),
    mensaje: "Indica el precio de un crédito de ElevenLabs en euros, con cuatro decimales como mucho.",
  },
  presupuestoCreditos: {
    valido: entero(0, 100_000_000),
    mensaje: "Indica un número entero de créditos (0 = sin presupuesto propio).",
  },
  presupuestoTrabajo: {
    valido: entero(0, 100_000_000),
    mensaje: "Indica un número entero de créditos (0 = sin tope por trabajo).",
  },
  trabajosSimultaneos: {
    valido: entero(1, 50),
    mensaje: "Indica de 1 a 50 trabajos simultáneos por usuario.",
  },
  escenasEnVuelo: {
    valido: entero(1, 24),
    mensaje: "Indica de 1 a 24 escenas en vuelo por usuario.",
  },
  presupuestoProyecto: {
    valido: entero(0, 100_000_000),
    mensaje: "Indica un número entero de créditos (0 = no proponer ninguno).",
  },
  asistenteActivo: { valido: booleano, mensaje: "Debe ser sí o no." },
  asistenteMargenEstimacion: {
    valido: entero(0, 200),
    mensaje: "Indica el margen prudente en %, de 0 a 200.",
  },
  traducirPrompts: { valido: booleano, mensaje: "Debe ser sí o no." },
  traduccionDiasCache: {
    valido: entero(0, 3650),
    mensaje: "Indica de 0 a 3650 días (0 = no guardar traducciones entre sesiones).",
  },
  mostrarPromptAlUsuario: { valido: booleano, mensaje: "Debe ser sí o no." },
  controlesExigirCoberturaVistas: { valido: booleano, mensaje: "Debe ser sí o no." },
  controlesExigirPrecioFresco: { valido: booleano, mensaje: "Debe ser sí o no." },
  controlesMaximoAvisos: {
    valido: entero(1, 10),
    mensaje: "Indica de 1 a 10 avisos confirmables a la vez.",
  },
  revisionToleranciaDuracion: {
    valido: decimal(0, 5),
    mensaje: "Indica la tolerancia de duración en segundos, de 0 a 5 (0 = exigir la duración exacta).",
  },
  revisionSegundosPlanosMaximos: {
    valido: decimal(0, 60),
    mensaje: "Indica los segundos de metraje negro o congelado que se toleran, de 0 a 60.",
  },
  revisionExigirAudio: { valido: booleano, mensaje: "Debe ser sí o no." },
  revisionMultimodalActiva: { valido: booleano, mensaje: "Debe ser sí o no." },
  coherenciaIdentidad: { valido: esModoCoherencia, mensaje: MENSAJE_MODO },
  coherenciaGuion: { valido: esModoCoherencia, mensaje: MENSAJE_MODO },
  coherenciaResultado: { valido: esModoCoherencia, mensaje: MENSAJE_MODO },
  coherenciaEmocion: { valido: esModoCoherencia, mensaje: MENSAJE_MODO },
  coherenciaDireccionFiel: { valido: esModoCoherencia, mensaje: MENSAJE_MODO },
  coherenciaProductoFiel: { valido: esModoCoherencia, mensaje: MENSAJE_MODO },
  coherenciaAnguloFiel: { valido: esModoCoherencia, mensaje: MENSAJE_MODO },
  coherenciaUmbralIdentidad: { valido: umbral, mensaje: MENSAJE_UMBRAL },
  coherenciaUmbralGuion: { valido: umbral, mensaje: MENSAJE_UMBRAL },
  coherenciaUmbralResultado: { valido: umbral, mensaje: MENSAJE_UMBRAL },
  coherenciaUmbralEmocion: { valido: umbral, mensaje: MENSAJE_UMBRAL },
  coherenciaUmbralDireccionFiel: { valido: umbral, mensaje: MENSAJE_UMBRAL },
  coherenciaUmbralProductoFiel: { valido: umbral, mensaje: MENSAJE_UMBRAL },
  coherenciaUmbralAnguloFiel: { valido: umbral, mensaje: MENSAJE_UMBRAL },
  coherenciaModeloImagen: { valido: identificadorModelo, mensaje: MENSAJE_MODELO },
  coherenciaModeloAudio: { valido: identificadorModelo, mensaje: MENSAJE_MODELO },
  coherenciaEurosPorMillonTokens: {
    valido: decimal(0, 1000),
    mensaje: "Indica lo que cuesta un millón de tokens de entrada de Jev en euros, con cuatro decimales como mucho.",
  },
  coherenciaDecisionesPorDia: {
    valido: entero(1, 10000),
    mensaje: "Indica de 1 a 10000 comprobaciones de coherencia por usuario y día.",
  },
  anuncioBriefActivo: { valido: booleano, mensaje: "Debe ser sí o no." },
  anuncioVariantesActivas: { valido: booleano, mensaje: "Debe ser sí o no." },
  vozTtsActivo: { valido: booleano, mensaje: "Debe ser sí o no." },
  transcripcionBinario: {
    // Nombre de orden o ruta, sin espacios ni metacaracteres: se ejecuta como proceso, así que aquí se acota lo
    // que puede llegar a ser un argumento del intérprete de órdenes.
    valido: (v: unknown) => texto(200)(v) && /^[a-zA-Z0-9._/-]*$/.test(v as string),
    mensaje: "Indica el nombre de la orden o su ruta, sin espacios (por ejemplo «whisper-cli»).",
  },
  transcripcionModelo: {
    valido: (v: unknown) => texto(400)(v) && /^[a-zA-Z0-9._/-]*$/.test(v as string),
    mensaje: "Indica la ruta del fichero de modelo, sin espacios. Vacío usa el del propio binario.",
  },
  minimoReferenciasPersonaje: {
    valido: entero(1, 10),
    mensaje: "Indica de 1 a 10 fotos de referencia como mínimo por personaje.",
  },
  calidadLadoMinimo: {
    valido: entero(64, 4096),
    mensaje: "Indica el lado menor mínimo en píxeles, de 64 a 4096.",
  },
  calidadNitidezMinima: {
    valido: decimal(0, 1000),
    mensaje: "Indica la nitidez mínima (0 = no comprobarla).",
  },
  calidadLuminosidadMinima: {
    valido: entero(0, 254),
    mensaje: "Indica la luminosidad mínima, de 0 a 254.",
  },
  calidadLuminosidadMaxima: {
    valido: entero(1, 255),
    mensaje: "Indica la luminosidad máxima, de 1 a 255.",
  },
  calidadCaraMinima: {
    valido: entero(0, 90),
    mensaje: "Indica el tamaño mínimo de la cara en % del lado menor (0 = no comprobarlo).",
  },
  urlPublica: {
    valido: urlPublicaValida,
    mensaje: "Escribe una dirección http:// o https:// completa, o déjalo vacío.",
  },
  correoRemitente: {
    // «correo@dominio» o «Nombre <correo@dominio>», sin saltos de línea.
    valido: (v) =>
      texto(200)(v) &&
      /^(?:[^<>\r\n]{0,100}<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/.test(v as string),
    mensaje: "Usa «correo@dominio» o «Nombre <correo@dominio>».",
  },
  smtpHost: {
    valido: (v) => texto(253)(v) && /^[a-z0-9.-]+$/i.test(v as string),
    mensaje: "Indica un nombre de servidor válido.",
  },
  smtpPuerto: { valido: entero(1, 65535), mensaje: "El puerto va de 1 a 65535." },
  smtpSeguro: { valido: booleano, mensaje: "Debe ser sí o no." },
  smtpUsuario: { valido: texto(200), mensaje: "El usuario es demasiado largo." },
  cabecerasIp: {
    valido: (v) => texto(200)(v) && /^[a-z0-9, -]*$/i.test(v as string),
    mensaje: "Solo nombres de cabecera separados por comas.",
  },
  googleClientId: { valido: idCliente, mensaje: "Pega el identificador de cliente que te da Google, sin espacios." },
  githubClientId: { valido: idCliente, mensaje: "Pega el identificador de cliente que te da GitHub, sin espacios." },
};

const CLAVES = Object.keys(AJUSTES_POR_DEFECTO) as (keyof Ajustes)[];
const VIGENCIA_MS = 30_000;

// Caché por proceso: evita consultar la base de datos en cada petición. Con varias instancias del
// servidor, un cambio tarda como mucho `VIGENCIA_MS` en verse en las demás.
// La versión evita publicar un resultado viejo: si alguien guarda mientras se está consultando la base de
// datos, lo leído se devuelve pero no se guarda en la caché, y la siguiente lectura vuelve a preguntar.
const global = globalThis as {
  __escenaraAjustes?: { valores: Ajustes; cargado: number; version: number };
  __escenaraAjustesVersion?: number;
};

const versionActual = () => (global.__escenaraAjustesVersion ??= 1);

/** Fuerza la relectura en este proceso (tras guardar). */
export function olvidarAjustes(): void {
  global.__escenaraAjustesVersion = versionActual() + 1;
}

export async function leerAjustes(): Promise<Ajustes> {
  const version = versionActual();
  const cache = global.__escenaraAjustes;
  if (cache && cache.version === version && Date.now() - cache.cargado < VIGENCIA_MS) return cache.valores;
  const filas = await db().select().from(settings);
  const valores: Ajustes = { ...AJUSTES_POR_DEFECTO };
  for (const fila of filas) {
    const clave = fila.key as keyof Ajustes;
    if (CLAVES.includes(clave) && VALIDACION[clave].valido(fila.value)) {
      (valores as unknown as Record<string, unknown>)[clave] = fila.value;
    }
  }
  if (versionActual() === version) global.__escenaraAjustes = { valores, cargado: Date.now(), version };
  return valores;
}

/** Valida y guarda los cambios; devuelve los ajustes resultantes. */
export async function guardarAjustes(cambios: Partial<Record<keyof Ajustes, unknown>>, usuarioId: string | null) {
  const validos: [keyof Ajustes, unknown][] = [];
  for (const [clave, valor] of Object.entries(cambios) as [keyof Ajustes, unknown][]) {
    if (!CLAVES.includes(clave)) continue;
    const limpio = typeof valor === "string" ? valor.trim() : valor;
    if (!VALIDACION[clave].valido(limpio)) throw new ErrorAjustes(clave, VALIDACION[clave].mensaje);
    validos.push([clave, limpio]);
  }
  // La horquilla de luminosidad no se valida campo a campo: con mínimo por encima del máximo, **ninguna**
  // foto pasaría el control y el motivo que vería el usuario sería falso.
  const resultantes = { ...(await leerAjustes()), ...Object.fromEntries(validos) } as Ajustes;
  if (resultantes.calidadLuminosidadMinima >= resultantes.calidadLuminosidadMaxima) {
    throw new ErrorAjustes(
      "calidadLuminosidadMinima",
      "La luminosidad mínima tiene que ser menor que la máxima: si no, ninguna foto pasaría el control.",
    );
  }
  await db().transaction(async (tx) => {
    for (const [clave, valor] of validos) {
      await tx
        .insert(settings)
        .values({ key: clave, value: valor, updatedBy: usuarioId, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: sql`excluded.value`, updatedBy: usuarioId, updatedAt: new Date() },
        });
    }
  });
  // Fuerza la relectura: este proceso ve el cambio al momento.
  olvidarAjustes();
  return leerAjustes();
}

/**
 * Cambio de crédito a euros **del proveedor que va a cobrar**. Nunca se usa el de otro: los créditos de dos
 * proveedores no son la misma unidad, así que convertirlos con una cifra ajena daría un euro inventado.
 *
 * `compatible` y `local` valen 0 € a propósito: se pagan por cuota del plan o no se pagan, y su llamada no tiene
 * precio por petición.
 */
/** Modo y umbral configurados para una comprobación de coherencia. Es el único sitio que los empareja. */
export function coherenciaDe(ajustes: Ajustes, comprobacion: Comprobacion): { modo: ModoCoherencia; umbral: number } {
  const modos: Record<Comprobacion, ModoCoherencia> = {
    identidad: ajustes.coherenciaIdentidad,
    guion: ajustes.coherenciaGuion,
    resultado: ajustes.coherenciaResultado,
    emocion: ajustes.coherenciaEmocion,
    direccion_fiel: ajustes.coherenciaDireccionFiel,
    producto_fiel: ajustes.coherenciaProductoFiel,
    angulo_fiel: ajustes.coherenciaAnguloFiel,
  };
  const umbrales: Record<Comprobacion, number> = {
    identidad: ajustes.coherenciaUmbralIdentidad,
    guion: ajustes.coherenciaUmbralGuion,
    resultado: ajustes.coherenciaUmbralResultado,
    emocion: ajustes.coherenciaUmbralEmocion,
    direccion_fiel: ajustes.coherenciaUmbralDireccionFiel,
    producto_fiel: ajustes.coherenciaUmbralProductoFiel,
    angulo_fiel: ajustes.coherenciaUmbralAnguloFiel,
  };
  return { modo: modos[comprobacion], umbral: umbrales[comprobacion] };
}

export function eurosPorCreditoDe(ajustes: Ajustes, proveedor: string): number {
  if (proveedor === "kie") return ajustes.eurosPorCreditoKie;
  if (proveedor === "google") return ajustes.eurosPorCreditoGoogle;
  if (proveedor === "elevenlabs") return ajustes.eurosPorCreditoElevenlabs;
  return 0;
}
