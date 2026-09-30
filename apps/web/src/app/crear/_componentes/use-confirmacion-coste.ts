"use client";

import { useState } from "react";

/**
 * Las casillas de la confirmación de un gasto: derecho sobre la imagen, derecho sobre la marca y aceptación del aviso
 * de gasto alto.
 *
 * Viven en quien pinta el paso (y no dentro del panel) para que la pantalla pueda contar lo que falta y señalarlo
 * arriba y en la barra. Cada gasto tiene las suyas: una confirmación no vale para otro envío.
 *
 * `vigente` dice si la confirmación existe ahora mismo. Cuando deja de existir (el clip pasa a estar en marcha, o se
 * cambia de camino) las casillas se **desmarcan**, exactamente como pasaba cuando el panel se desmontaba: pedir otro
 * clip es otra confirmación y exige volver a marcarlas.
 */
export interface EstadoConfirmacion {
  derechos: boolean;
  derechoMarca: boolean;
  avisoAceptado: boolean;
  setDerechos: (valor: boolean) => void;
  setDerechoMarca: (valor: boolean) => void;
  setAvisoAceptado: (valor: boolean) => void;
}

export function useConfirmacionCoste(vigente = true): EstadoConfirmacion {
  const [derechos, setDerechos] = useState(false);
  const [derechoMarca, setDerechoMarca] = useState(false);
  const [avisoAceptado, setAvisoAceptado] = useState(false);
  const [eraVigente, setEraVigente] = useState(vigente);
  // Ajuste durante el render (patrón documentado de React): al cambiar `vigente` se reinicia sin pasar por un efecto.
  if (eraVigente !== vigente) {
    setEraVigente(vigente);
    setDerechos(false);
    setDerechoMarca(false);
    setAvisoAceptado(false);
  }
  return { derechos, derechoMarca, avisoAceptado, setDerechos, setDerechoMarca, setAvisoAceptado };
}
