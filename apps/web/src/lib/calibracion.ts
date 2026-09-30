import { MUESTRA_MINIMA } from "./coherencia";
import type { EtiquetaHumana, PreguntaSombra } from "./decisiones";

/**
 * **Calibración de umbrales** contra un conjunto etiquetado (RF13). Lógica pura: la usan el servidor, la pantalla y
 * los tests por igual.
 *
 * Qué es un umbral aquí: la confianza mínima por debajo de la cual el evaluador «no opina» (`revisar`). Por encima,
 * dice «pasa» si encaja (≥ 0,5) y «no pasa» si no. Es la misma regla que `veredictoDe` de la coherencia.
 *
 * El PRD (§9) avisa de dos cosas que aquí se respetan al pie de la letra:
 *
 * - la confianza describe la forma de la distribución, **no** cuántas veces acierta: el umbral se elige mirando
 *   aciertos contra personas, nunca la confianza sola;
 * - sin datos, el umbral **no se usa para automatizar**: con muestra insuficiente no se propone ninguno. Y aunque se
 *   proponga, proponer no activa nada: ningún control se vuelve bloqueante por calibrarse.
 *
 * El umbral se elige **solo** con la partición de calibración y se mide **solo** en la retenida, que no ha visto la
 * elección: medir en la misma muestra con la que se eligió es sobreajustar y llamarlo acierto.
 */

export const PARTICIONES = ["calibracion", "retenido"] as const;
export type Particion = (typeof PARTICIONES)[number];

export const esParticion = (v: unknown): v is Particion => PARTICIONES.includes(v as Particion);

export const NOMBRE_PARTICION: Record<Particion, string> = {
  calibracion: "Calibración",
  retenido: "Retenido",
};

/** De cada diez ejemplos, cuántos van a calibración. El resto se retiene para medir. */
const DECIMOS_CALIBRACION = 7;

/**
 * Partición de un ejemplo, **determinista**: depende solo del identificador de su origen. Reconstruir el conjunto no
 * mueve ningún ejemplo de partición, así que lo retenido sigue sin haberse visto al elegir.
 */
export function particionDe(origenId: string): Particion {
  // FNV-1a de 32 bits: estable, sin dependencias y repartido de sobra para esto.
  let h = 0x811c9dc5;
  for (let i = 0; i < origenId.length; i++) {
    h ^= origenId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 10 < DECIMOS_CALIBRACION ? "calibracion" : "retenido";
}

/** Un ejemplo etiquetado, reducido a lo que se calibra. Solo números y una etiqueta: nada de nadie. */
export interface EjemploEtiquetado {
  /** Cuánto encaja (0–1). «Encaja» es lo bueno: por encima de 0,5 el evaluador deja pasar. */
  encaja: number;
  confianza: number;
  etiqueta: EtiquetaHumana;
  particion: Particion;
}

/** Cómo se comporta un umbral sobre una muestra. */
export interface MedidaDeUmbral {
  umbral: number;
  /** Ejemplos medidos. */
  muestra: number;
  /** Con confianza suficiente para opinar («pasa» o «no pasa»). */
  firmes: number;
  sinOpinion: number;
  aciertos: number;
  /** Dejaba pasar y la persona rechazó. El error caro. */
  falsosPermisos: number;
  /** Frenaba y la persona aceptó. El error molesto. */
  bloqueosInnecesarios: number;
  /** Aciertos entre las opiniones firmes (0–1); `null` sin ninguna firme. */
  precision: number | null;
  /** Parte de la muestra en la que opina (0–1). */
  cobertura: number;
}

/** Umbrales que se prueban. No hay una frontera universal: se busca la de cada pregunta. */
export const UMBRALES_CANDIDATOS: readonly number[] = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];

/**
 * Tasa máxima de falsos permisos entre las opiniones firmes para que un umbral sea aceptable. El falso permiso es el
 * error caro (dejar pasar lo que una persona frenó), así que es el que acota; la cobertura decide entre los que
 * cumplen.
 */
export const TASA_MAXIMA_FALSOS_PERMISOS = 0.05;

/**
 * Muestra mínima **en cada partición** para proponer un umbral. Es la misma que exige el panel de coherencia para
 * enseñar un porcentaje: por debajo, cualquier cifra es cómoda y falsa.
 */
export const MUESTRA_MINIMA_CALIBRACION = MUESTRA_MINIMA;

/**
 * Mínimo de decisiones con corrección humana para evaluar Laya como segundo evaluador. Hasta alcanzarlo, Laya se
 * aplaza: con decenas de ejemplos no se puede distinguir un evaluador mejor de uno con suerte.
 */
export const MINIMO_PARA_LAYA = 200;

const redondear = (n: number) => Math.round(n * 10_000) / 10_000;

/** Mide un umbral sobre una muestra. Pura. */
export function medirUmbral(ejemplos: readonly EjemploEtiquetado[], umbral: number): MedidaDeUmbral {
  let firmes = 0;
  let aciertos = 0;
  let falsosPermisos = 0;
  let bloqueosInnecesarios = 0;
  for (const e of ejemplos) {
    if (e.confianza < umbral) continue;
    firmes++;
    const pasa = e.encaja >= 0.5;
    if (pasa && e.etiqueta === "rechaza") falsosPermisos++;
    else if (!pasa && e.etiqueta === "acepta") bloqueosInnecesarios++;
    else aciertos++;
  }
  return {
    umbral,
    muestra: ejemplos.length,
    firmes,
    sinOpinion: ejemplos.length - firmes,
    aciertos,
    falsosPermisos,
    bloqueosInnecesarios,
    precision: firmes === 0 ? null : redondear(aciertos / firmes),
    cobertura: ejemplos.length === 0 ? 0 : redondear(firmes / ejemplos.length),
  };
}

/** Resultado de calibrar una pregunta. */
export interface ResultadoCalibracion {
  /** `null` si no se propone ninguno (muestra insuficiente o ningún umbral cumple). */
  umbral: number | null;
  /** `false` si alguna partición no llega a la muestra mínima. */
  suficiente: boolean;
  motivo: string;
  muestraCalibracion: number;
  muestraRetenida: number;
  enCalibracion: MedidaDeUmbral | null;
  enRetenido: MedidaDeUmbral | null;
}

const pct = (n: number) => `${Math.round(n * 100)} %`;

/** Aviso del PRD §9, dicho siempre igual. */
export const AVISO_SIN_DATOS = "Sin datos, el umbral no se usa para automatizar.";

/**
 * Calibra una pregunta: elige el umbral **con la partición de calibración** y lo mide **en la retenida**.
 *
 * El umbral elegido es el que más cobertura da entre los que, con al menos la muestra mínima de opiniones firmes,
 * dejan los falsos permisos en el {@link TASA_MAXIMA_FALSOS_PERMISOS} o menos; a igual cobertura, el más bajo. Si
 * ninguno cumple, no se propone nada: bajar la exigencia para que salga un número sería inventárselo.
 */
export function calibrar(ejemplos: readonly EjemploEtiquetado[]): ResultadoCalibracion {
  const calibracion = ejemplos.filter((e) => e.particion === "calibracion");
  const retenido = ejemplos.filter((e) => e.particion === "retenido");
  const base = {
    muestraCalibracion: calibracion.length,
    muestraRetenida: retenido.length,
  };
  if (calibracion.length < MUESTRA_MINIMA_CALIBRACION || retenido.length < MUESTRA_MINIMA_CALIBRACION) {
    return {
      ...base,
      umbral: null,
      suficiente: false,
      motivo: `Muestra insuficiente: ${calibracion.length} ejemplos en calibración y ${retenido.length} retenidos, y hacen falta ${MUESTRA_MINIMA_CALIBRACION} en cada partición. ${AVISO_SIN_DATOS}`,
      enCalibracion: null,
      enRetenido: null,
    };
  }
  let mejor: MedidaDeUmbral | null = null;
  for (const umbral of UMBRALES_CANDIDATOS) {
    const medida = medirUmbral(calibracion, umbral);
    if (medida.firmes < MUESTRA_MINIMA_CALIBRACION) continue;
    if (medida.falsosPermisos / medida.firmes > TASA_MAXIMA_FALSOS_PERMISOS) continue;
    if (mejor === null || medida.firmes > mejor.firmes) mejor = medida;
  }
  if (mejor === null) {
    return {
      ...base,
      umbral: null,
      suficiente: true,
      motivo: `Ningún umbral deja los falsos permisos en el ${pct(TASA_MAXIMA_FALSOS_PERMISOS)} o menos con al menos ${MUESTRA_MINIMA_CALIBRACION} opiniones firmes en la partición de calibración. No se propone ninguno.`,
      enCalibracion: null,
      enRetenido: null,
    };
  }
  const enRetenido = medirUmbral(retenido, mejor.umbral);
  return {
    ...base,
    umbral: mejor.umbral,
    suficiente: true,
    motivo: `Umbral elegido con la partición de calibración (${pct(mejor.cobertura)} de cobertura con ${mejor.falsosPermisos} falsos permisos en ${mejor.firmes} opiniones firmes) y medido en la retenida, que no se usó para elegirlo. Es una propuesta: no activa nada.`,
    enCalibracion: mejor,
    enRetenido,
  };
}

/** Una pregunta en Admin › Calibración, tal como la pinta la pantalla. */
export interface CalibracionVista {
  pregunta: PreguntaSombra;
  nombre: string;
  /** `false` cuando la etiqueta la pone alguien que ha visto el veredicto. */
  etiquetaIndependiente: boolean;
  /** Ejemplos del conjunto por partición y etiqueta, ahora mismo. */
  conjunto: Record<Particion, { acepta: number; rechaza: number }>;
  /** Último cálculo guardado; `null` si nunca se ha calibrado. */
  ultima: {
    fecha: string;
    umbral: number | null;
    suficiente: boolean;
    motivo: string;
    muestraCalibracion: number;
    muestraRetenida: number;
    enCalibracion: MedidaDeUmbral | null;
    enRetenido: MedidaDeUmbral | null;
  } | null;
}
