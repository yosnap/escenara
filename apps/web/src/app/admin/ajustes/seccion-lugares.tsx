"use client";

import { MapPin } from "lucide-react";
import { Interruptor } from "@/components/ui/choice";
import type { Ajustes } from "@/server/ajustes";
import { Seccion } from "./seccion-ajustes";

/**
 * **Lugares**: lo que se puede decidir sin desplegar. Hoy, dos experimentos, **apagados de fábrica**: combinar en
 * las escenas habladas de Omni la identidad registrada con el fotograma situado en el lugar. Se midió una vez con
 * dinero real (2026-09-30): mismo precio, lugar y cara fieles; la voz está pendiente de escucharse. Por eso no se
 * enciende solo.
 *
 * El veredicto «Es el mismo lugar que su foto maestra» (`lugar_fiel`) está en la sección Coherencia, en sombra.
 */
export function SeccionLugares({
  valores,
  onCambio,
}: {
  valores: Ajustes;
  onCambio: <K extends keyof Ajustes>(clave: K, valor: Ajustes[K]) => void;
}) {
  return (
    <Seccion
      titulo="Lugares"
      descripcion="Sitios que los usuarios reutilizan como escenario. Cada uno con su maestra, sus versiones y su declaración de derechos."
      icono={<MapPin />}
    >
      <Interruptor
        etiqueta="Escenas habladas con lugar: combinar personaje registrado y fotograma situado (experimental)"
        descripcion="En modo Omni, envía a la vez la identidad registrada y el fotograma aprobado de la escena, ya situado en su lugar. Cuesta lo mismo (63 créditos por 4 s, medido el 30/09/2026) y el lugar sale fiel, pero la voz no está confirmada. Apagado, el lugar viaja solo descrito."
        activo={valores.omniLugarCombinado}
        onCambio={(v) => onCambio("omniLugarCombinado", v)}
      />
      <Interruptor
        etiqueta="Vídeo completo: arrancar cada clip de su plano base con la identidad registrada"
        descripcion="Solo en los vídeos completos escritos por el asistente y solo con su plano base (un fotograma por personaje, situado en el lugar con su ropa). Enciéndelo cuando hayas escuchado un clip combinado y la voz sea la registrada. Apagado, el plano base no viaja y el lugar va descrito."
        activo={valores.omniLugarCombinadoVideoCompleto}
        onCambio={(v) => onCambio("omniLugarCombinadoVideoCompleto", v)}
      />
      <p className="text-sm text-texto-suave">
        El veredicto <strong className="font-semibold text-texto">«Es el mismo lugar que su foto maestra»</strong> está
        en la sección Coherencia con su modo y su umbral. Nace en sombra y no se comprueba si sale una persona real.
      </p>
    </Seccion>
  );
}
