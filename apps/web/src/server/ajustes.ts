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
  correoRemitente: string;
  smtpHost: string;
  smtpPuerto: number;
  /** TLS directo (puerto 465). Con `false` se usa STARTTLS si el servidor lo ofrece. */
  smtpSeguro: boolean;
  smtpUsuario: string;
  /** Cabeceras con la IP real que escribe el proxy propio (separadas por comas); vacío = `x-forwarded-for`. */
  cabecerasIp: string;
}

export const AJUSTES_POR_DEFECTO: Ajustes = {
  registroAbierto: true,
  cuotaMb: 2048,
  correoRemitente: "Escenara <no-responder@escenara.local>",
  smtpHost: "localhost",
  smtpPuerto: 1021,
  smtpSeguro: false,
  smtpUsuario: "",
  cabecerasIp: "",
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

const VALIDACION: Record<keyof Ajustes, { valido: (v: unknown) => boolean; mensaje: string }> = {
  registroAbierto: { valido: booleano, mensaje: "Debe ser sí o no." },
  cuotaMb: { valido: entero(0, 10_000_000), mensaje: "Indica un número entero de MB (0 = sin límite)." },
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
};

const CLAVES = Object.keys(AJUSTES_POR_DEFECTO) as (keyof Ajustes)[];
const VIGENCIA_MS = 30_000;

// Caché por proceso: evita consultar la base de datos en cada petición. Con varias instancias del
// servidor, un cambio tarda como mucho `VIGENCIA_MS` en verse en las demás.
const global = globalThis as { __escenaraAjustes?: { valores: Ajustes; cargado: number } };

export async function leerAjustes(): Promise<Ajustes> {
  const cache = global.__escenaraAjustes;
  if (cache && Date.now() - cache.cargado < VIGENCIA_MS) return cache.valores;
  const filas = await db().select().from(settings);
  const valores: Ajustes = { ...AJUSTES_POR_DEFECTO };
  for (const fila of filas) {
    const clave = fila.key as keyof Ajustes;
    if (CLAVES.includes(clave) && VALIDACION[clave].valido(fila.value)) {
      (valores as unknown as Record<string, unknown>)[clave] = fila.value;
    }
  }
  global.__escenaraAjustes = { valores, cargado: Date.now() };
  return valores;
}

/** Valida y guarda los cambios; devuelve los ajustes resultantes. */
export async function guardarAjustes(cambios: Partial<Record<keyof Ajustes, unknown>>, usuarioId: string) {
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
  if (global.__escenaraAjustes) global.__escenaraAjustes.cargado = 0;
  return leerAjustes();
}
