import {
  type Acento,
  DESCRIPCION_EXPERTA_MAXIMA,
  DIRECCION_CON_ACENTO_VACIA,
  type DireccionElegidaConAcento,
  esAcento,
  esFormatoClip,
  esMomentoMicroaccion,
  esRegistroEstetico,
  INSTRUCCIONES_EXTRA_MAXIMAS,
} from "@/lib/direccion";
import { limpiarTextoDePrompt } from "@/lib/ficha-personaje";
import { DIRECCION_VOCAL_MAXIMA } from "@/lib/proyectos";
import { ErrorGeneracion } from "../generacion/errores";

/**
 * **El borde de la dirección que llega del navegador** (0.25.1).
 *
 * «Crear» no tiene escena que guarde lo elegido, así que la dirección viaja con la confirmación del clip. Lo que
 * viaja son **claves del catálogo y enumerados**, nunca fragmentos de prompt: la traducción a inglés la hace el
 * servidor con su propio catálogo (`direccion/escena.ts › direccionDesdeEleccion`), y una clave que no exista se
 * comporta como «no elegido». Esto es lo que impide que un cliente cuele texto suyo en el prompt (ADR-0022).
 *
 * Los tres campos de texto libre —el matiz de voz, las instrucciones adicionales y la descripción del modo
 * experto— sí son texto del usuario, y pasan por **la misma limpieza anti-inyección** que la ficha del personaje
 * y las plantillas: `limpiarTextoDePrompt` quita banderas, asignaciones y parámetros del proveedor. Escribir la
 * descripción entera es decidir qué se ve, no cómo se le paga al proveedor.
 */

/** Forma de una clave de preset: es un identificador del catálogo, no texto. */
const CLAVE = /^[a-z0-9-]{1,60}$/;

function clave(valor: unknown, campo: string): string {
  if (valor === undefined || valor === null || valor === "") return "";
  if (typeof valor !== "string" || !CLAVE.test(valor)) {
    throw new ErrorGeneracion(400, `La opción de «${campo}» que has enviado no es válida.`);
  }
  return valor;
}

/**
 * Lee la dirección elegida del cuerpo de una confirmación. `null` cuando no viene ninguna: el clip se genera
 * como en la 0.24.x, con la plantilla y sin dirigir.
 */
export function leerDireccionElegida(valor: unknown): DireccionElegidaConAcento | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== "object" || Array.isArray(valor)) {
    throw new ErrorGeneracion(400, "La dirección del clip que has enviado no es válida.");
  }
  const c = valor as Record<string, unknown>;
  const formatoClip = c.formatoClip ?? DIRECCION_CON_ACENTO_VACIA.formatoClip;
  if (!esFormatoClip(formatoClip)) throw new ErrorGeneracion(400, "Ese formato de clip no existe.");
  const momento = c.momentoMicroaccion ?? DIRECCION_CON_ACENTO_VACIA.momentoMicroaccion;
  if (!esMomentoMicroaccion(momento)) throw new ErrorGeneracion(400, "Ese momento de la micro-acción no existe.");
  const registro = c.registroEstetico ?? DIRECCION_CON_ACENTO_VACIA.registroEstetico;
  if (!esRegistroEstetico(registro)) throw new ErrorGeneracion(400, "Ese registro estético no existe.");
  const acento: Acento = c.acento === undefined ? DIRECCION_CON_ACENTO_VACIA.acento : leerAcento(c.acento);
  return {
    formatoClip,
    plano: clave(c.plano, "plano"),
    angulo: clave(c.angulo, "ángulo"),
    camara: clave(c.camara, "movimiento de cámara"),
    microaccion: clave(c.microaccion, "micro-acción"),
    momentoMicroaccion: momento,
    optica: clave(c.optica, "óptica"),
    luz: clave(c.luz, "luz"),
    localizacion: clave(c.localizacion, "sitio"),
    registroEstetico: registro,
    direccionVocal: limpiarTextoDePrompt(c.direccionVocal, DIRECCION_VOCAL_MAXIMA),
    instruccionesExtra: limpiarTextoDePrompt(c.instruccionesExtra, INSTRUCCIONES_EXTRA_MAXIMAS),
    modoExperto: c.modoExperto === true,
    descripcionExperta: limpiarTextoDePrompt(c.descripcionExperta, DESCRIPCION_EXPERTA_MAXIMA),
    acento,
  };
}

/** Acento del habla. Se rechaza con su motivo en lugar de caer al de fábrica sin decirlo. */
export function leerAcento(valor: unknown): Acento {
  if (!esAcento(valor)) {
    throw new ErrorGeneracion(400, "Ese acento no está entre los que ofrece Escenara.");
  }
  return valor;
}
