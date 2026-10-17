"use client";

import { AYUDA_MARCA_VISIBLE, INVITACION_MARCA_SIN_RESPONDER, PREGUNTA_MARCA_VISIBLE } from "@/lib/productos";
import { GrupoOpciones } from "../choice";
import { Aviso } from "../feedback";

/**
 * **¿En las fotos se ve una marca?** Respuesta obligatoria Sí/No del alta de un producto, con el grupo de opciones
 * del catálogo (nada de `<select>` nativo ni de una casilla que, sin marcar, parecía un «no»).
 *
 * `null` es «sin responder»: en el alta impide crear, y en la ficha de un producto anterior a la pregunta se invita
 * a responderla, porque mientras tanto cada vídeo pide la declaración de marca.
 */
export function PreguntaMarca({
  valor,
  onCambio,
  invitarSiFalta = false,
}: {
  valor: boolean | null;
  onCambio: (valor: boolean) => void;
  /** En la ficha: si está sin responder, se dice qué pasa mientras tanto. */
  invitarSiFalta?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {invitarSiFalta && valor === null && <Aviso tono="aviso">{INVITACION_MARCA_SIN_RESPONDER}</Aviso>}
      <GrupoOpciones
        etiqueta={PREGUNTA_MARCA_VISIBLE}
        valor={valor === null ? "" : valor ? "si" : "no"}
        opciones={[
          { value: "si", etiqueta: "Sí, se ve una marca", descripcion: "Se te pedirá confirmar que puedes usarla." },
          {
            value: "no",
            etiqueta: "No, no se ve ninguna",
            descripcion: "No se te pedirá ninguna declaración de marca.",
          },
        ]}
        onCambio={(v) => onCambio(v === "si")}
      />
      <p className="text-sm text-texto-suave">{AYUDA_MARCA_VISIBLE}</p>
    </div>
  );
}
