import { PROMPT_MINIMO } from "./generacion";
import type { MotivoDePlantilla } from "./plantillas-prompt";
import type { VariablePlantilla } from "./presets";
import {
  type DatosConfirmacion,
  ID_DESCRIPCION,
  idRequisito,
  pendientesPorPaso,
  type Requisito,
  requisitosDeConfirmacion,
  requisitosDeControles,
  requisitosDePlantilla,
} from "./requisitos";

/**
 * Los requisitos de los dos envíos de «Crear» (el fotograma y el clip), cada uno con el campo y el paso al que
 * apunta. Son los **mismos bloqueos de siempre**, con los mismos textos y las mismas condiciones: aquí solo se
 * decide a qué señalan. Ninguno habilita ni deshabilita nada por sí mismo; el botón sigue apagado por la misma lista.
 */

export const TEXTO_SIN_MODELO_SIN_IMAGEN =
  "Esta instalación no tiene ningún modelo que genere sin imagen de partida: elige un personaje o una foto.";
export const TEXTO_FALTA_REVISION_FOTOS = "Falta confirmar la revisión de las fotos.";
export const TEXTO_MODELO_SIN_REFERENCIAS =
  "El modelo elegido no acepta fotos de referencia: elige otro para generar con un personaje.";
export const TEXTO_FALTA_DESCRIBIR = "Falta describir la escena.";
export const TEXTO_FALTA_REVISION_DEL_CLIP = "Falta confirmar la revisión de las fotos del personaje.";

export const ENVIO_FOTOGRAMA = "fotograma";
export const ENVIO_CLIP = "clip";

/** Marcas de los campos del paso «A quién generas», que solo existen en el camino del fotograma. */
export const ID_SUJETO = idRequisito(ENVIO_FOTOGRAMA, "sujeto");
export const ID_MODELO_FOTOGRAMA = idRequisito(ENVIO_FOTOGRAMA, "modelo");
export const ID_REVISION_FOTOGRAMA = idRequisito(ENVIO_FOTOGRAMA, "revision");
export const ID_REVISION_CLIP = idRequisito(ENVIO_CLIP, "revision");

export interface DatosDelFotograma {
  /** No hay personaje ni imagen elegidos: se genera solo con la descripción. */
  sinImagen: boolean;
  /** La instalación tiene algún modelo que genere sin imagen de partida. */
  hayModeloSinImagen: boolean;
  /** Hay personaje o foto elegidos. */
  haySujeto: boolean;
  sinTerceros: boolean;
  /** Hay personaje y el modelo elegido no admite fotos de referencia. */
  modeloSinReferencias: boolean;
  /** Caracteres de la descripción ya recortada. */
  caracteresDescripcion: number;
  /** Lo que impide componer el prompt con la plantilla del fotograma. */
  motivosPlantilla: readonly MotivoDePlantilla[];
}

/** Lo que falta para poder generar el fotograma. El orden es el de siempre. */
export function requisitosDelFotograma(d: DatosDelFotograma): Requisito[] {
  return [
    // Sin personaje ni imagen no falta nada: se genera a partir de la descripción con un modelo de texto a
    // imagen. Lo que sí falta es que haya alguno con el que hacerlo.
    ...(d.sinImagen && !d.hayModeloSinImagen
      ? [{ id: ID_SUJETO, paso: "sujeto", texto: TEXTO_SIN_MODELO_SIN_IMAGEN }]
      : []),
    ...(d.haySujeto && !d.sinTerceros
      ? [{ id: ID_REVISION_FOTOGRAMA, paso: "sujeto", texto: TEXTO_FALTA_REVISION_FOTOS }]
      : []),
    ...(d.modeloSinReferencias
      ? [{ id: ID_MODELO_FOTOGRAMA, paso: "sujeto", texto: TEXTO_MODELO_SIN_REFERENCIAS }]
      : []),
    ...(d.caracteresDescripcion >= PROMPT_MINIMO
      ? []
      : [{ id: ID_DESCRIPCION, paso: "escena", texto: TEXTO_FALTA_DESCRIBIR }]),
    // Todo lo que impide componer el prompt, con la explicación que da el renderizador: qué falta y qué número
    // está fuera de rango. No se resume en «revisa los datos».
    ...requisitosDePlantilla(d.motivosPlantilla, { envio: ENVIO_FOTOGRAMA, paso: "escena", pasoDelTexto: "escena" }),
  ];
}

export interface DatosDelClip {
  /** El clip sale de una imagen tuya: no hay paso de escena, así que la variable de texto se escribe en el paso del clip. */
  sinPasoDeEscena: boolean;
  motivosPlantilla: readonly MotivoDePlantilla[];
  exigeRevision: boolean;
  sinTerceros: boolean;
}

/** Lo que falta para poder generar el clip, sin contar las casillas de la confirmación ni los controles previos. */
export function requisitosDelClip(d: DatosDelClip): Requisito[] {
  return [
    ...requisitosDePlantilla(d.motivosPlantilla, {
      envio: ENVIO_CLIP,
      paso: "clip",
      pasoDelTexto: d.sinPasoDeEscena ? "clip" : "escena",
    }),
    ...(d.exigeRevision && !d.sinTerceros
      ? [{ id: ID_REVISION_CLIP, paso: "clip", texto: TEXTO_FALTA_REVISION_DEL_CLIP }]
      : []),
  ];
}

/**
 * Todo lo que falta de un envío, en el orden en que lo cuenta el panel de confirmación: lo propio de la pantalla,
 * los frenos de los controles previos y las casillas de la confirmación. Es la misma lista que apaga el botón.
 */
export function requisitosDelEnvio(
  propios: readonly Requisito[],
  frenosDeControles: readonly string[],
  confirmacion: DatosConfirmacion,
): Requisito[] {
  return [
    ...propios,
    ...requisitosDeControles(frenosDeControles, confirmacion.envio, confirmacion.paso),
    ...requisitosDeConfirmacion(confirmacion),
  ];
}

/**
 * La variable de texto de la plantilla, la que se rellena con la descripción de la escena. Si hay varias se elige la
 * obligatoria y, si no, la primera: todas comparten el mismo valor, así que solo se pinta un campo.
 */
export const variableDeTexto = (variables: readonly VariablePlantilla[]): VariablePlantilla | null => {
  const deTexto = variables.filter((v) => v.tipo === "texto");
  return deTexto.find((v) => v.obligatoria) ?? deTexto[0] ?? null;
};

/** Casillas de una confirmación tal como las guarda la pantalla. */
export interface CasillasDeConfirmacion {
  derechos: boolean;
  derechoMarca: boolean;
  avisoAceptado: boolean;
}

export interface DatosDeRequisitosDeCrear {
  /** Camino elegido: con una imagen tuya no hay envío de fotograma. */
  origen: "fotograma" | "imagen";
  fotograma: DatosDelFotograma;
  clip: DatosDelClip;
  /** Frenos de los controles previos de cada envío. */
  frenosFotograma: readonly string[];
  frenosClip: readonly string[];
  casillasFotograma: CasillasDeConfirmacion;
  casillasClip: CasillasDeConfirmacion;
  conProducto: boolean;
  fotogramaSuperaUmbral: boolean;
  clipSuperaUmbral: boolean;
  /** Hay imagen de la que sale el clip, y no hay un clip ya en marcha: solo entonces existe su confirmación. */
  clipPorConfirmar: boolean;
}

export interface RequisitosDeCrear {
  /** Todo lo que falta para generar el fotograma, con los controles y las casillas del coste. */
  fotograma: Requisito[];
  /** Lo propio del fotograma que falta (sin controles ni casillas): se marca en los campos de sus pasos. */
  fotogramaBase: Requisito[];
  clip: Requisito[];
  clipBase: Requisito[];
  /** Cuántos faltan por paso, para la barra. */
  pendientes: Record<string, number>;
}

/**
 * Los requisitos de toda la pantalla de «Crear», calculados de una vez con las mismas funciones que arman los
 * bloqueos de cada panel de confirmación, así que aviso, campos, barra y botón hablan de lo mismo.
 */
export function requisitosDeCrear(d: DatosDeRequisitosDeCrear): RequisitosDeCrear {
  const fotogramaBase = requisitosDelFotograma(d.fotograma);
  const clipBase = requisitosDelClip(d.clip);
  const fotograma = requisitosDelEnvio(fotogramaBase, d.frenosFotograma, {
    ...d.casillasFotograma,
    envio: ENVIO_FOTOGRAMA,
    paso: "coste",
    conProducto: d.conProducto,
    superaUmbral: d.fotogramaSuperaUmbral,
  });
  const clip = requisitosDelEnvio(clipBase, d.frenosClip, {
    ...d.casillasClip,
    envio: ENVIO_CLIP,
    paso: "clip",
    conProducto: d.conProducto,
    superaUmbral: d.clipSuperaUmbral,
  });
  return {
    fotograma,
    fotogramaBase,
    clip,
    clipBase,
    pendientes: pendientesPorPaso([
      ...(d.origen === "fotograma" ? fotograma : []),
      ...(d.clipPorConfirmar ? clip : []),
    ]),
  };
}
