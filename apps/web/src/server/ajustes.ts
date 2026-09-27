import { sql } from "drizzle-orm";
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
  /** Cambio aproximado de crédito a euros, solo para mostrar la estimación en euros. */
  eurosPorCredito: number;
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
   * `calidadLadoMinimo` es el único **mínimo técnico**: por debajo, la foto no se guarda como referencia ni
   * con «usar de todas formas». Los demás avisan y se pueden saltar.
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
  eurosPorCredito: 0.005,
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

const VALIDACION: Record<keyof Ajustes, { valido: (v: unknown) => boolean; mensaje: string }> = {
  registroAbierto: { valido: booleano, mensaje: "Debe ser sí o no." },
  cuotaMb: { valido: entero(0, 10_000_000), mensaje: "Indica un número entero de MB (0 = sin límite)." },
  avisoCreditos: {
    valido: entero(0, 1_000_000),
    mensaje: "Indica un número entero de créditos (0 = avisar siempre).",
  },
  eurosPorCredito: {
    valido: decimal(0, 100),
    mensaje: "Indica el precio de un crédito en euros, con cuatro decimales como mucho.",
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
