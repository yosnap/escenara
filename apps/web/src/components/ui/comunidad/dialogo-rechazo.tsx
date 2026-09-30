"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MOTIVO_MAXIMO, MOTIVO_MINIMO, type PublicacionEnModeracion } from "@/lib/comunidad";
import { Alerta } from "../alerta";
import { Boton } from "../button";
import { AreaTexto, Campo } from "../field";
import { Dialogo } from "../overlay";
import { moderarPublicacion } from "./api-comunidad";

/** Rechazar (o retirar de la galería) con **motivo escrito**: es lo que leerá el autor. */
export function DialogoRechazo({
  publicacion,
  abierto,
  onAbiertoCambio,
}: {
  publicacion: PublicacionEnModeracion;
  abierto: boolean;
  onAbiertoCambio: (v: boolean) => void;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aprobada = publicacion.estado === "aprobada";
  const rechazar = async () => {
    setOcupado(true);
    setError(null);
    const r = await moderarPublicacion(publicacion.id, { accion: "rechazar", revision: publicacion.revision, motivo });
    setOcupado(false);
    if (!r.ok) return setError(r.error);
    onAbiertoCambio(false);
    router.refresh();
  };
  return (
    <Dialogo
      titulo={aprobada ? "Retirar de la galería" : "Rechazar la publicación"}
      descripcion="El autor verá este motivo. Di qué norma incumple y qué puede cambiar."
      abierto={abierto}
      onAbiertoCambio={onAbiertoCambio}
      pie={
        <Boton
          variante="peligro"
          cargando={ocupado}
          disabled={motivo.trim().length < MOTIVO_MINIMO}
          onClick={() => void rechazar()}
        >
          {aprobada ? "Retirar con este motivo" : "Rechazar con este motivo"}
        </Boton>
      }
    >
      <Campo etiqueta="Motivo" ayuda={`De ${MOTIVO_MINIMO} a ${MOTIVO_MAXIMO} caracteres.`}>
        {(p) => (
          <AreaTexto
            {...p}
            rows={4}
            value={motivo}
            maxLength={MOTIVO_MAXIMO}
            onChange={(e) => setMotivo(e.target.value)}
          />
        )}
      </Campo>
      {error && (
        <Alerta tipo="error" titulo="No se ha guardado la decisión">
          {error}
        </Alerta>
      )}
    </Dialogo>
  );
}
