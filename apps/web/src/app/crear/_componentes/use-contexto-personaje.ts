"use client";

import { useState } from "react";
import { consultarContexto } from "@/components/ui/personajes/api-personajes";
import type { ContextoAplicado } from "@/lib/personajes";

/**
 * Contexto y fotos del personaje que el servidor va a enviar. Lo pide la acción que lo cambia (personaje o modelo),
 * nunca un efecto, y cada petición llega con su función de vigencia: una respuesta que ya no es la última no cambia
 * el contexto **ni apaga el «cargando»**, porque la vigente sigue en camino y es ella la que lo apagará.
 */
export function useContextoPersonaje(inicial: ContextoAplicado | null, alFallar: (error: string) => void) {
  const [contexto, setContexto] = useState<ContextoAplicado | null>(inicial);
  const [pidiendo, setPidiendo] = useState(false);

  const refrescar = async (id: string | null, modelo: string, vigente: () => boolean = () => true) => {
    if (!id) {
      setPidiendo(false);
      setContexto(null);
      return;
    }
    setPidiendo(true);
    const respuesta = await consultarContexto(id, modelo);
    if (!vigente()) return;
    setPidiendo(false);
    // Un fallo aquí no impide generar: lo que decide es el servidor al encolar. Se dice y no se muestra nada.
    if (!respuesta.ok) {
      setContexto(null);
      alFallar(respuesta.error);
      return;
    }
    setContexto(respuesta.datos);
  };

  return { contexto, pidiendo, refrescar };
}
