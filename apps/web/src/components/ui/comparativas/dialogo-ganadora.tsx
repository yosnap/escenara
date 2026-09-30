"use client";

import { Boton } from "../button";
import { Dialogo } from "../overlay";

/**
 * Confirmar la ganadora de una comparativa A/B. No cuesta nada, pero cambia el clip de la escena y deja sin valor su
 * revisión: se dice antes, en un diálogo del catálogo (nunca `confirm()`).
 */
export function DialogoGanadora({
  nombre,
  ocupado,
  onCerrar,
  onConfirmar,
}: {
  nombre: string;
  ocupado: boolean;
  onCerrar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <Dialogo
      abierto
      onAbiertoCambio={(abierto) => !abierto && onCerrar()}
      titulo={`Usar el clip de ${nombre} en la escena`}
      descripcion="No cuesta nada ni genera nada: cambia el clip que entra en el montaje."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Dejarlo como está
          </Boton>
          <Boton cargando={ocupado} onClick={onConfirmar}>
            Usar este clip
          </Boton>
        </>
      }
    >
      <p className="text-texto">
        El clip que tiene ahora la escena no se borra: sigue en tu biblioteca y en sus versiones. La revisión de la
        escena deja de valer, porque lo revisado ya no es el clip que hay, y el montaje estrena versión.
      </p>
    </Dialogo>
  );
}
