"use client";

import { CircleCheck, OctagonAlert, ThumbsDown } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { AreaTexto, Campo } from "@/components/ui/field";
import { type AccionRevision, MOTIVO_MAXIMO, MOTIVO_MINIMO } from "@/lib/revision";

/**
 * Las tres decisiones de la persona que ha mirado el clip. Es lo único que valida la identidad del personaje: lo
 * automático mide el archivo.
 *
 * Rechazar y marcar como crítico **exigen motivo** (la misma regla que aplica el servidor, no una copia laxa):
 * sin él, nadie sabrá después qué había que arreglar. Marcar como crítico se separa a propósito y dice lo que hace:
 * es la decisión que bloquea la exportación del proyecto entero.
 */
export function DecisionHumana({
  ocupado,
  onDecidir,
}: {
  ocupado: boolean;
  onDecidir: (accion: AccionRevision, motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const limpio = motivo.trim();
  const faltaMotivo = limpio.length < MOTIVO_MINIMO;

  const decidir = (accion: AccionRevision) => {
    onDecidir(accion, limpio);
    setMotivo("");
  };

  return (
    <div className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-4">
      <div>
        <h3 className="font-bold text-texto">Tu decisión</h3>
        <p className="mt-0.5 text-sm text-texto-suave">
          Aceptar no cuesta nada y no genera nada: solo deja constancia de que has mirado esta escena y la das por
          buena.
        </p>
      </div>
      <Campo
        etiqueta="Qué falla (obligatorio para rechazar o marcar como crítico)"
        ayuda={`Al menos ${MOTIVO_MINIMO} caracteres. Se guarda con tu decisión, así que escribe lo que habría que arreglar.`}
      >
        {(p) => (
          <AreaTexto
            {...p}
            rows={2}
            maxLength={MOTIVO_MAXIMO}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por ejemplo: el pelo cambia de color respecto a la hoja de personaje."
          />
        )}
      </Campo>
      <div className="flex flex-wrap gap-2">
        <Boton
          variante="primario"
          tamano="sm"
          icono={<CircleCheck className="size-4" />}
          cargando={ocupado}
          onClick={() => decidir("aceptar")}
        >
          Aceptar la escena
        </Boton>
        <Boton
          variante="secundario"
          tamano="sm"
          icono={<ThumbsDown className="size-4" />}
          disabled={ocupado || faltaMotivo}
          onClick={() => decidir("rechazar")}
        >
          Rechazar con motivo
        </Boton>
        <Boton
          variante="peligro"
          tamano="sm"
          icono={<OctagonAlert className="size-4" />}
          disabled={ocupado || faltaMotivo}
          onClick={() => decidir("marcar-critico")}
        >
          Marcar como crítico
        </Boton>
      </div>
      {faltaMotivo && (
        <p className="text-sm text-texto-suave">
          Escribe el motivo para poder rechazar o marcar como crítico. Aceptar no lo necesita.
        </p>
      )}
      <p className="text-sm text-texto-suave">
        Marcar como crítico <strong>bloquea la exportación</strong> del proyecto hasta que se resuelva: se resuelve
        regenerando la escena o aceptándola después expresamente.
      </p>
    </div>
  );
}
