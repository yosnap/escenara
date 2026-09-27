"use client";

import { Ban, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { Dialogo } from "@/components/ui/overlay";
import { type EscenaProduccionVista, efectoDeCancelar, textoDeCancelacion } from "@/lib/produccion";

/**
 * Cancelar y autorizar reintentos de una escena. Las dos son decisiones con consecuencias de dinero, así que las
 * dos se piden en un diálogo del catálogo (nunca `confirm()` nativo) y **dicen antes lo que va a pasar**.
 *
 * Cancelar es la **zona de claridad** más delicada de esta versión: lo que aún no ha salido se cancela y suelta su
 * reserva, y lo que ya está en el proveedor **se cobrará**, porque no admite cancelación. El texto lo compone
 * `lib/produccion.ts`, que es la misma función que se prueba.
 */
export function AccionesEscena({
  escena,
  ocupado,
  onCancelar,
  onReintentos,
}: {
  escena: EscenaProduccionVista;
  ocupado: boolean;
  onCancelar: () => void;
  onReintentos: (reintentos: number) => void;
}) {
  const [cancelando, setCancelando] = useState(false);
  const [autorizando, setAutorizando] = useState(false);
  const [reintentos, setReintentos] = useState(1);
  const efecto = efectoDeCancelar(escena);
  const hayQueCancelar = efecto.seCancelan > 0 || efecto.seCobraran > 0;

  return (
    <div className="flex flex-wrap gap-2">
      {hayQueCancelar && (
        <>
          <Boton
            variante="secundario"
            tamano="sm"
            icono={<Ban className="size-4" />}
            disabled={ocupado}
            onClick={() => setCancelando(true)}
          >
            Cancelar esta escena
          </Boton>
          <Dialogo
            abierto={cancelando}
            onAbiertoCambio={setCancelando}
            titulo={`Cancelar la escena ${escena.orden}`}
            descripcion="Esto solo afecta a esta escena: las demás siguen como están."
            pie={
              <>
                <Boton variante="secundario" onClick={() => setCancelando(false)}>
                  Dejarlo como está
                </Boton>
                <Boton
                  variante="peligro"
                  cargando={ocupado}
                  onClick={() => {
                    setCancelando(false);
                    onCancelar();
                  }}
                >
                  Cancelar lo que se pueda
                </Boton>
              </>
            }
          >
            <p className="text-texto">{textoDeCancelacion(efecto)}</p>
          </Dialogo>
        </>
      )}

      {escena.motivoUltimoFallo !== "" && (
        <>
          <Boton
            variante="secundario"
            tamano="sm"
            icono={<RotateCcw className="size-4" />}
            disabled={ocupado}
            onClick={() => setAutorizando(true)}
          >
            Autorizar reintentos
          </Boton>
          <Dialogo
            abierto={autorizando}
            onAbiertoCambio={setAutorizando}
            titulo={`Reintentos de la escena ${escena.orden}`}
            descripcion="Escenara nunca reintenta por su cuenta algo que pudo cobrarse: lo autorizas tú, escena a escena."
            pie={
              <>
                <Boton variante="secundario" onClick={() => setAutorizando(false)}>
                  Cerrar
                </Boton>
                <Boton
                  cargando={ocupado}
                  disabled={!Number.isInteger(reintentos) || reintentos < 1 || reintentos > 10}
                  onClick={() => {
                    setAutorizando(false);
                    onReintentos(reintentos);
                  }}
                >
                  Autorizar
                </Boton>
              </>
            }
          >
            <div className="flex flex-col gap-3">
              <p className="text-texto">
                Llevas {escena.reintentosUsados} de {escena.presupuestoReintentos} reintentos autorizados en esta
                escena. Cada reintento vuelve a pagar el fotograma completo.
              </p>
              <Campo etiqueta="Reintentos que autorizas además de los ya consumidos" ayuda="De 1 a 10.">
                {(p) => (
                  <EntradaTexto
                    {...p}
                    type="number"
                    min={1}
                    max={10}
                    step={1}
                    inputMode="numeric"
                    className="max-w-32"
                    value={Number.isNaN(reintentos) ? "" : reintentos}
                    onChange={(e) => setReintentos(e.target.value === "" ? Number.NaN : Number(e.target.value))}
                  />
                )}
              </Campo>
            </div>
          </Dialogo>
        </>
      )}
    </div>
  );
}
