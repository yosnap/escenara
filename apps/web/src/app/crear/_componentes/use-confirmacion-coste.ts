"use client";

import { useState } from "react";

/**
 * Las casillas de la confirmación de un gasto: derecho sobre la imagen, derecho sobre la marca y aceptación del aviso
 * de gasto alto.
 *
 * Viven en quien pinta el paso (y no dentro del panel) para que la pantalla pueda contar lo que falta y señalarlo
 * arriba y en la barra. Cada gasto tiene las suyas: una confirmación no vale para otro envío.
 *
 * Una confirmación vale para lo que se leyó y para nada más, así que las casillas se **desmarcan** cuando:
 * - `vigente` deja de serlo o vuelve a serlo (se cambia de camino o el clip pasa a estar en marcha): es lo que pasaba
 *   antes al desmontarse el panel;
 * - cambia la `imagen` sobre la que se declaran los derechos;
 * y el aviso de gasto, además, cuando cambia el `sello` del precio (otro modelo, otra duración, otro trend): aceptar un
 * gasto alto no vale para otro importe.
 */
export interface CasillasMarcadas {
  derechos: boolean;
  derechoMarca: boolean;
  avisoAceptado: boolean;
}

export interface ContextoDeConfirmacion {
  vigente: boolean;
  /** Identificador de la imagen (o personaje) de la que se declaran los derechos; vacío si aún no hay ninguna. */
  imagen: string;
  /** Sello del precio de la estimación que se está confirmando. */
  sello: string;
}

export interface EstadoInterno {
  casillas: CasillasMarcadas;
  /** Contexto con el que se marcaron. */
  visto: ContextoDeConfirmacion;
}

const SIN_MARCAR: CasillasMarcadas = { derechos: false, derechoMarca: false, avisoAceptado: false };

/** Estado inicial: sin nada marcado. */
export const estadoInicialDeConfirmacion = (contexto: ContextoDeConfirmacion): EstadoInterno => ({
  casillas: SIN_MARCAR,
  visto: contexto,
});

/**
 * Lo que queda marcado al pasar a `actual`. Devuelve el mismo objeto si no ha cambiado nada, para poder usarlo como
 * ajuste durante el render sin bucles.
 */
export function ajustarConfirmacion(estado: EstadoInterno, actual: ContextoDeConfirmacion): EstadoInterno {
  const { visto, casillas } = estado;
  if (visto.vigente === actual.vigente && visto.imagen === actual.imagen && visto.sello === actual.sello) return estado;
  if (visto.vigente !== actual.vigente || visto.imagen !== actual.imagen)
    return { casillas: SIN_MARCAR, visto: actual };
  return { casillas: { ...casillas, avisoAceptado: false }, visto: actual };
}

/**
 * El contexto de cada una de las dos confirmaciones de «Crear». El del fotograma existe solo en el camino de generar
 * un fotograma; el del clip, mientras hay imagen de la que sacarlo y no hay un clip ya en marcha.
 */
export function contextosDeConfirmacion(d: {
  origen: "fotograma" | "imagen";
  /** Personaje o imagen elegidos para el fotograma. */
  sujetoDelFotograma: string | undefined;
  selloFotograma: string;
  clipPorConfirmar: boolean;
  imagenDelClip: string | undefined;
  selloClip: string;
}): { fotograma: ContextoDeConfirmacion; clip: ContextoDeConfirmacion } {
  return {
    fotograma: { vigente: d.origen === "fotograma", imagen: d.sujetoDelFotograma ?? "", sello: d.selloFotograma },
    clip: { vigente: d.clipPorConfirmar, imagen: d.imagenDelClip ?? "", sello: d.selloClip },
  };
}

export interface EstadoConfirmacion extends CasillasMarcadas {
  setDerechos: (valor: boolean) => void;
  setDerechoMarca: (valor: boolean) => void;
  setAvisoAceptado: (valor: boolean) => void;
}

export function useConfirmacionCoste(contexto: ContextoDeConfirmacion): EstadoConfirmacion {
  const [estado, setEstado] = useState(() => estadoInicialDeConfirmacion(contexto));
  // Ajuste durante el render (patrón documentado de React): al cambiar el contexto se reinicia sin pasar por un efecto.
  const ajustado = ajustarConfirmacion(estado, contexto);
  if (ajustado !== estado) setEstado(ajustado);
  const poner = (campo: keyof CasillasMarcadas) => (valor: boolean) =>
    setEstado((previo) => ({ ...previo, casillas: { ...previo.casillas, [campo]: valor } }));
  return {
    ...ajustado.casillas,
    setDerechos: poner("derechos"),
    setDerechoMarca: poner("derechoMarca"),
    setAvisoAceptado: poner("avisoAceptado"),
  };
}
