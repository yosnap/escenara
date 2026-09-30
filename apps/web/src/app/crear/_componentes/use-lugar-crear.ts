"use client";

import { useRef, useState } from "react";
import type { LugarDeEscena } from "@/lib/lugares";

/** En «Crear» no hay proyecto del que heredar: el lugar es uno tuyo o ninguno. */
const SIN_LUGAR: LugarDeEscena = { heredar: false, lugarId: "", sitio: "", plano: "con_reparto" };

/**
 * **El lugar del fotograma en «Crear»**: cuál y dónde dentro de él. Elegir otro cambia lo que evalúan los controles
 * previos (su declaración, su acabado y si su maestra cabe en el cupo), así que se vuelve a preguntar al servidor en
 * el mismo gesto, no en un efecto. Lo que viaja son el identificador y el texto del usuario; el servidor comprueba
 * que el lugar sea suyo y compone el prompt.
 */
export function useLugarDeCrear(refrescar: () => void) {
  const [lugar, setLugar] = useState<LugarDeEscena>(SIN_LUGAR);
  // El elegido se lee también fuera del render (al refrescar los controles en el mismo gesto que lo cambia).
  const actual = useRef(SIN_LUGAR.lugarId);
  const elegir = (nuevo: LugarDeEscena) => {
    setLugar(nuevo);
    const cambia = nuevo.lugarId !== actual.current;
    actual.current = nuevo.lugarId;
    if (cambia) refrescar();
  };
  return {
    lugar,
    elegir,
    /** Lo que se añade a la consulta de los controles del fotograma. */
    enLaConsulta: () => (actual.current === "" ? {} : { lugarId: actual.current }),
    /** Lo que se añade al envío del fotograma. */
    enElEnvio: lugar.lugarId === "" ? {} : { lugar: { lugarId: lugar.lugarId, sitio: lugar.sitio } },
  };
}
