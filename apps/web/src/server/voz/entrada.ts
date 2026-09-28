import {
  esModoVoz,
  esVozOfrecida,
  LIMITES_PARAMETROS_VOZ,
  type ModoVoz,
  NOTA_DERECHOS_MAXIMA,
  normalizarTextoDeSubtitulo,
  type ParametrosVoz,
  parametroVozValido,
  SUBTITULO_MAXIMO,
  SUBTITULOS_MAXIMOS,
  type Subtitulo,
} from "@/lib/voz";
import { ErrorProyecto } from "../asistente/errores";
import type { ConfirmacionVoz } from "./tts";

/**
 * Lectura y validación de lo que llega del navegador a la pantalla de voz y subtítulos (RF08, 0.21.0). **Todo lo
 * que entra se valida en el borde**: un campo que no tenga la forma esperada no llega al servicio.
 *
 * Lo que aquí no se decide: de quién es el proyecto (lo comprueba `proyectoPropio`, que responde 404 para uno
 * ajeno) ni si se puede gastar (lo decide `tts.ts` con la confirmación del coste).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tope de claves de aviso por petición y longitud de cada una: son identificadores de regla, no texto libre. */
const AVISOS_CONFIRMADOS_MAXIMOS = 20;
const CLAVE_REGLA_MAXIMA = 60;

/** Identificador de la escena. Que sea tuya y de este proyecto lo comprueba la ruta y el servicio, no esto. */
export function leerEscenaId(cuerpo: Record<string, unknown>): string {
  const id = cuerpo.escenaId;
  if (typeof id !== "string" || !UUID.test(id)) throw new ErrorProyecto(400, "Esa escena no existe.");
  return id;
}

export function leerModoVoz(cuerpo: Record<string, unknown>): ModoVoz {
  if (!esModoVoz(cuerpo.modo)) throw new ErrorProyecto(400, "Ese modo de voz no existe.");
  return cuerpo.modo;
}

/** `true` cuando el usuario ha confirmado expresamente que este cambio invalida lo ya generado. */
export const leerConfirmadoInvalidar = (cuerpo: Record<string, unknown>): boolean =>
  cuerpo.confirmarInvalidacion === true;

/** `true` cuando el usuario acepta que unos subtítulos que corrigió a mano se sustituyan por otros. */
export const leerConfirmadoSobrescribir = (cuerpo: Record<string, unknown>): boolean =>
  cuerpo.confirmarSobrescribir === true;

/**
 * Voz y parámetros que se van a fijar **en el proyecto**.
 *
 * Aquí se rechaza expresamente que la petición traiga una escena: la voz es del proyecto (decisión firme del
 * propietario, 2026-09-28) y un cliente que intente fijarla por escena recibe el motivo, no un cambio silencioso
 * que solo afectara a una. Sin esta comprobación, la regla dependería de que ningún cliente lo intentara.
 */
export function leerEleccionDeVoz(cuerpo: Record<string, unknown>): { voz: string; parametros: ParametrosVoz } {
  if (cuerpo.escenaId !== undefined) {
    throw new ErrorProyecto(
      409,
      "La voz se elige para todo el proyecto, no escena a escena: si cada escena tuviera la suya, el timbre cambiaría de plano a plano. Cambia la voz del proyecto y regenera las escenas que quieras.",
    );
  }
  if (!esVozOfrecida(cuerpo.voz)) {
    throw new ErrorProyecto(400, "Esa voz no está entre las que ofrece esta instalación.");
  }
  return { voz: cuerpo.voz, parametros: leerParametrosVoz(cuerpo.parametros) };
}

/** Parámetros de la voz. Un valor fuera de la horquilla documentada del proveedor se rechaza con su motivo. */
export function leerParametrosVoz(crudo: unknown): ParametrosVoz {
  if (!crudo || typeof crudo !== "object") throw new ErrorProyecto(400, "Faltan los parámetros de la voz.");
  const o = crudo as Record<string, unknown>;
  const salida = {} as ParametrosVoz;
  for (const clave of Object.keys(LIMITES_PARAMETROS_VOZ) as (keyof ParametrosVoz)[]) {
    if (!parametroVozValido(clave, o[clave])) {
      const { min, max } = LIMITES_PARAMETROS_VOZ[clave];
      throw new ErrorProyecto(400, `El parámetro «${clave}» de la voz tiene que estar entre ${min} y ${max}.`);
    }
    salida[clave] = Math.round((o[clave] as number) * 100) / 100;
  }
  return salida;
}

/**
 * Confirmación del coste de generar la voz de una escena. **Sin ella no se llama a nadie**: los créditos, el sello
 * y la clave son obligatorios, así que una petición que no traiga lo que el usuario tenía delante se rechaza aquí y
 * no deja ni un apunte en el registro de gasto.
 */
export function leerConfirmacionVoz(cuerpo: Record<string, unknown>): ConfirmacionVoz {
  const creditos = cuerpo.creditosConfirmados;
  if (typeof creditos !== "number" || !Number.isFinite(creditos) || creditos < 0) {
    throw new ErrorProyecto(
      400,
      "Falta la confirmación del coste de la pista de voz: esa llamada cuesta créditos y no se lanza sin que la confirmes.",
    );
  }
  const sello = cuerpo.selloEstimacion;
  if (typeof sello !== "string" || sello === "" || sello.length > 200) {
    throw new ErrorProyecto(400, "Falta la estimación confirmada de la pista de voz. Vuelve a revisar el coste.");
  }
  const clave = cuerpo.claveIdempotencia;
  if (typeof clave !== "string" || !UUID.test(clave)) {
    throw new ErrorProyecto(400, "Falta la clave de la confirmación: vuelve a cargar la página.");
  }
  return {
    creditosConfirmados: creditos,
    selloEstimacion: sello,
    claveIdempotencia: clave,
    avisoUmbralAceptado: cuerpo.avisoUmbralAceptado === true,
    avisosConfirmados: leerAvisosConfirmados(cuerpo),
  };
}

/**
 * Avisos salvables del motor de controles que el usuario ha confirmado, por su clave de regla.
 *
 * Sin esto, un aviso confirmable (por ejemplo, un precio comprobado hace demasiado) dejaría la voz **bloqueada sin
 * salida**: el motor pediría una confirmación que ninguna petición podía traer. No se comprueba aquí si cada clave
 * existe: eso lo decide el motor, que es quien sabe qué avisos ha emitido; aquí solo se acota la forma.
 */
function leerAvisosConfirmados(cuerpo: Record<string, unknown>): string[] {
  const crudo = cuerpo.avisosConfirmados;
  if (crudo === undefined) return [];
  if (!Array.isArray(crudo) || crudo.length > AVISOS_CONFIRMADOS_MAXIMOS) {
    throw new ErrorProyecto(400, "Las confirmaciones de los avisos no tienen la forma esperada.");
  }
  const claves = crudo.filter((v): v is string => typeof v === "string" && v !== "" && v.length <= CLAVE_REGLA_MAXIMA);
  if (claves.length !== crudo.length) {
    throw new ErrorProyecto(400, "Las confirmaciones de los avisos no tienen la forma esperada.");
  }
  return [...new Set(claves)];
}

/** Subtítulos editados que llegan del editor. Los tiempos los exige el servicio; aquí se acota la forma. */
export function leerSubtitulos(cuerpo: Record<string, unknown>): Subtitulo[] {
  const crudo = cuerpo.subtitulos;
  if (!Array.isArray(crudo)) throw new ErrorProyecto(400, "Envía los subtítulos como una lista.");
  if (crudo.length > SUBTITULOS_MAXIMOS) {
    throw new ErrorProyecto(400, `Una escena no puede tener más de ${SUBTITULOS_MAXIMOS} subtítulos.`);
  }
  return crudo.map((linea, i) => {
    if (!linea || typeof linea !== "object")
      throw new ErrorProyecto(400, `El subtítulo ${i + 1} no tiene la forma esperada.`);
    const { desde, hasta, texto } = linea as { desde?: unknown; hasta?: unknown; texto?: unknown };
    if (typeof desde !== "number" || typeof hasta !== "number" || !Number.isFinite(desde) || !Number.isFinite(hasta)) {
      throw new ErrorProyecto(400, `El subtítulo ${i + 1} no tiene tiempos numéricos.`);
    }
    if (typeof texto !== "string" || texto.length > SUBTITULO_MAXIMO) {
      throw new ErrorProyecto(400, `El texto del subtítulo ${i + 1} no puede pasar de ${SUBTITULO_MAXIMO} caracteres.`);
    }
    // El texto se normaliza **en el borde**: lo que se guarda es lo que se va a escribir en el SRT y en el WebVTT,
    // y esos formatos se rompen con una línea en blanco o con la secuencia de los tiempos dentro del texto.
    return {
      desde: Math.round(desde * 100) / 100,
      hasta: Math.round(hasta * 100) / 100,
      texto: normalizarTextoDeSubtitulo(texto),
    };
  });
}

/** Pista de música que se añade, con su declaración de derechos. El mínimo de la declaración lo exige el servicio. */
export function leerMusica(cuerpo: Record<string, unknown>): {
  medioId: string;
  notaDerechos: string;
  volumen: number;
} {
  const medioId = cuerpo.medioId;
  if (typeof medioId !== "string" || !UUID.test(medioId)) throw new ErrorProyecto(404, "Ese archivo no existe.");
  const nota = cuerpo.notaDerechos;
  if (typeof nota !== "string" || nota.length > NOTA_DERECHOS_MAXIMA + 100) {
    throw new ErrorProyecto(400, `La declaración de derechos no puede pasar de ${NOTA_DERECHOS_MAXIMA} caracteres.`);
  }
  return { medioId, notaDerechos: nota, volumen: leerVolumen(cuerpo) };
}

/** Volumen de una pista. Fuera de 0–1 se rechaza: un volumen de 40 no es un mando, es un error del cliente. */
export function leerVolumen(cuerpo: Record<string, unknown>): number {
  const volumen = cuerpo.volumen;
  if (typeof volumen !== "number" || !Number.isFinite(volumen) || volumen < 0 || volumen > 1) {
    throw new ErrorProyecto(400, "El volumen de la música tiene que estar entre 0 y 1.");
  }
  return volumen;
}

/** Identificador de una pista de música del proyecto. */
export function leerPistaId(cuerpo: Record<string, unknown>): string {
  const id = cuerpo.pistaId;
  if (typeof id !== "string" || !UUID.test(id)) throw new ErrorProyecto(404, "Esa pista de música no existe.");
  return id;
}
