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
   * Fotos de referencia que un personaje necesita como mínimo para poder generar. Con menos, la identidad
   * se pierde entre fotogramas: en el prototipo del 2026-09-27 cinco fotos dieron buen resultado y tres son
   * el mínimo razonable. La cobertura guiada de vistas llega en 0.14.0.
   */
  minimoReferenciasPersonaje: number;
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
  minimoReferenciasPersonaje: 3,
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
  minimoReferenciasPersonaje: {
    valido: entero(1, 10),
    mensaje: "Indica de 1 a 10 fotos de referencia como mínimo por personaje.",
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
