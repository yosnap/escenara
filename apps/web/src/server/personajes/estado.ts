import type { EstadoPersonaje, TipoPersonaje, TitularConsentimiento } from "@/lib/personajes";
import { exigeDocumento, exigeMayoriaDeEdad } from "@/lib/personajes";

/**
 * Cómo se deduce el estado de un personaje y por qué no puede generar. Está aparte del acceso a la base de
 * datos para que sea puro y se pueda probar sin PostgreSQL: es la regla que decide si una cara se envía o
 * no a un proveedor, así que conviene leerla de una vez y sin ruido.
 *
 * El estado se **deduce siempre** de los datos (consentimiento y número de referencias) y la columna
 * `characters.state` solo lo cachea para poder listar y filtrar. Nada autoriza a generar por lo que diga esa
 * columna: `puedeGenerarCon` vuelve a deducirlo.
 */

/** Consentimiento reducido a lo que decide el estado. */
export interface ConsentimientoEfectivo {
  titular: TitularConsentimiento;
  /** `true` aceptado, `false` rechazado, `null` sin revisar. */
  aceptado: boolean | null;
  revocado: boolean;
  /** Si el registro lleva la declaración de mayoría de edad (`consent_records.adult_declared`). */
  mayoriaDeclarada: boolean;
}

export interface DatosDeEstado {
  /** Tipo guardado del personaje: la declaración de mayoría de edad solo se exige a una persona. */
  tipo: TipoPersonaje;
  consentimiento: ConsentimientoEfectivo | null;
  referencias: number;
  minimoReferencias: number;
}

/** `true` cuando el consentimiento existe, no está revocado y, si necesita revisión, está aceptado. */
export function consentimientoVigente(consentimiento: ConsentimientoEfectivo | null): boolean {
  if (!consentimiento || consentimiento.revocado) return false;
  return exigeDocumento(consentimiento.titular) ? consentimiento.aceptado === true : true;
}

/**
 * Una persona real cuyo consentimiento vigente no lleva la declaración de mayoría de edad. El registro la exige,
 * pero esta regla no se fía de por dónde llegó el dato (una carrera entre cambiar el tipo y registrar, datos
 * antiguos, una ruta futura): si falta, el personaje no genera. Un inventado no declara edad: no es nadie real.
 */
const faltaMayoriaDeEdad = (datos: DatosDeEstado): boolean => {
  const c = datos.consentimiento;
  return (
    c !== null && !c.revocado && c.titular !== "inventado" && exigeMayoriaDeEdad(datos.tipo) && !c.mayoriaDeclarada
  );
};

export function estadoDePersonaje(datos: DatosDeEstado): EstadoPersonaje {
  const c = datos.consentimiento;
  // Revocado o rechazado: bloqueado, y no vuelve solo. Hay que registrar un consentimiento nuevo.
  if (c && (c.revocado || c.aceptado === false)) return "bloqueado";
  if (faltaMayoriaDeEdad(datos)) return "bloqueado";
  if (!c) return "borrador";
  if (exigeDocumento(c.titular) && c.aceptado === null) return "en_revision";
  return datos.referencias >= datos.minimoReferencias ? "listo" : "borrador";
}

/** Motivos, en lenguaje llano, por los que el personaje no se puede usar para generar. Vacío = se puede. */
export function impedimentosDePersonaje(datos: DatosDeEstado): string[] {
  const motivos: string[] = [];
  const c = datos.consentimiento;
  if (!c) {
    motivos.push("Falta registrar el consentimiento de uso de imagen.");
  } else if (c.revocado) {
    motivos.push("El consentimiento está revocado: registra uno nuevo para volver a usar el personaje.");
  } else if (c.aceptado === false) {
    motivos.push("La revisión del consentimiento se ha rechazado.");
  } else if (faltaMayoriaDeEdad(datos)) {
    motivos.push(
      "Falta la declaración de mayoría de edad de la persona de las fotos: revoca este consentimiento y registra uno nuevo declarando que es mayor de edad.",
    );
  } else if (exigeDocumento(c.titular) && c.aceptado === null) {
    motivos.push("El consentimiento de un tercero espera la revisión de quien administra la instalación.");
  }
  if (datos.referencias < datos.minimoReferencias) {
    const faltan = datos.minimoReferencias - datos.referencias;
    // Un inventado no usa fotos: lo que le falta son imágenes generadas, su retrato elegido y sus vistas.
    motivos.push(
      c?.titular === "inventado"
        ? `${faltan === 1 ? "Falta 1 imagen" : `Faltan ${faltan} imágenes`} entre su retrato elegido y sus vistas generadas: hacen falta ${datos.minimoReferencias} y tiene ${datos.referencias}.${datos.referencias === 0 ? " Empieza por generar sus retratos y elegir uno." : ""}`
        : `Faltan ${faltan} ${faltan === 1 ? "foto" : "fotos"} de referencia: hacen falta ${datos.minimoReferencias} y hay ${datos.referencias}.`,
    );
  }
  return motivos;
}

/** `true` solo si el personaje puede generar ahora mismo. Es la misma regla que aplica el servidor. */
export const personajePuedeGenerar = (datos: DatosDeEstado): boolean =>
  estadoDePersonaje(datos) === "listo" && impedimentosDePersonaje(datos).length === 0;
