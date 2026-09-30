import type { MotivoDePlantilla } from "./plantillas-prompt";

/**
 * **Requisitos pendientes** antes de poder generar: cada uno dice qué falta y **a qué apunta** (el campo o la casilla
 * y el paso donde se arregla). Sustituyen a las listas de frases sueltas de los bloqueos: el texto es el mismo de
 * siempre y la regla que lo dispara también; solo se añade a dónde llevar a quien lo lee.
 *
 * No hay aquí nada de React ni del navegador, para probar la correspondencia entre bloqueo y campo sin pintar nada.
 */
export interface Requisito {
  /** Marca del campo o de la casilla a la que apunta (`data-requisito` en la pantalla). Única en toda la página. */
  id: string;
  /** Paso del flujo que contiene ese campo. */
  paso: string;
  /** Qué falta, en lenguaje llano y con la causa. Es también el mensaje que se enseña bajo el campo. */
  texto: string;
}

/** Los textos son los de siempre: los tests y las guías los citan tal cual. */
export const TEXTO_FALTA_DERECHOS = "Falta confirmar que tienes derecho a usar la imagen.";
export const TEXTO_FALTA_MARCA = "Falta confirmar que tienes derecho a usar la marca del producto.";
export const TEXTO_FALTA_AVISO_GASTO = "Falta aceptar el aviso de gasto.";

/** Identificador de un campo dentro de un envío concreto («fotograma», «clip», «insercion»). */
export const idRequisito = (envio: string, campo: string) => `${envio}-${campo}`;

/**
 * Campo donde se escribe lo que ocurre en la escena. Es **uno solo** en toda la pantalla: en el camino del
 * fotograma vive en el paso «Describe la escena» y con una imagen tuya (que no tiene ese paso) en el del clip.
 */
export const ID_DESCRIPCION = "descripcion";

/** Estado de las casillas de la confirmación del coste y lo que las hace obligatorias. */
export interface DatosConfirmacion {
  /** Envío al que pertenecen («fotograma», «clip», «insercion»): forma parte del identificador del campo. */
  envio: string;
  /** Paso donde está el panel de confirmación. */
  paso: string;
  conProducto: boolean;
  superaUmbral: boolean;
  derechos: boolean;
  derechoMarca: boolean;
  avisoAceptado: boolean;
}

/** Lo que falta de la confirmación del coste: las casillas de derechos y el aviso de gasto, en su orden de siempre. */
export function requisitosDeConfirmacion(d: DatosConfirmacion): Requisito[] {
  const de = (campo: string, texto: string): Requisito => ({ id: idRequisito(d.envio, campo), paso: d.paso, texto });
  return [
    ...(d.derechos ? [] : [de("derechos", TEXTO_FALTA_DERECHOS)]),
    ...(!d.conProducto || d.derechoMarca ? [] : [de("marca", TEXTO_FALTA_MARCA)]),
    ...(!d.superaUmbral || d.avisoAceptado ? [] : [de("aviso-gasto", TEXTO_FALTA_AVISO_GASTO)]),
  ];
}

/** Los frenos de los controles previos, que se arreglan (o se confirman) en el panel «Antes de generar». */
export const requisitosDeControles = (textos: readonly string[], envio: string, paso: string): Requisito[] =>
  textos.map((texto) => ({ id: idRequisito(envio, "controles"), paso, texto }));

/**
 * Lo que impide componer el prompt con la plantilla elegida. Lo que sale de una variable de texto se arregla
 * escribiendo la escena; el resto (una categoría sin elegir, un número fuera de rango), con la botonera del envío.
 */
export function requisitosDePlantilla(
  motivos: readonly MotivoDePlantilla[],
  destino: { envio: string; paso: string; pasoDelTexto: string },
): Requisito[] {
  return motivos.map((m) =>
    m.deTexto
      ? { id: ID_DESCRIPCION, paso: destino.pasoDelTexto, texto: m.texto }
      : { id: idRequisito(destino.envio, "plantilla"), paso: destino.paso, texto: m.texto },
  );
}

/**
 * Cuántos requisitos pendientes tiene cada paso, para decirlo en la barra. Los pasos sin ninguno no aparecen. Un mismo
 * requisito que llega por dos envíos (la escena que piden el fotograma y el clip) se cuenta una vez.
 */
export function pendientesPorPaso(requisitos: readonly Requisito[]): Record<string, number> {
  const cuenta: Record<string, number> = {};
  const vistos = new Set<string>();
  for (const r of requisitos) {
    const clave = `${r.id}|${r.texto}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    cuenta[r.paso] = (cuenta[r.paso] ?? 0) + 1;
  }
  return cuenta;
}

/** Mensaje del primer requisito pendiente de un campo, o `undefined` si no le falta nada. */
export const errorDeRequisito = (requisitos: readonly Requisito[], id: string): string | undefined =>
  requisitos.find((r) => r.id === id)?.texto;
