"use client";

import { Check, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PublicacionEnModeracion } from "@/lib/comunidad";
import { Alerta } from "../alerta";
import { Boton } from "../button";
import { moderarPublicacion } from "./api-comunidad";

/** El diálogo del motivo se descarga al pulsar «Rechazar». */
const DialogoRechazo = dynamic(() => import("./dialogo-rechazo").then((m) => m.DialogoRechazo), { ssr: false });

/**
 * Aprobar o rechazar una publicación con **motivo escrito** (lo lee el autor). No se puede aprobar lo propio ni lo que
 * ya no es elegible: el botón lo explica y el servidor lo impide igualmente. Se decide sobre la revisión que se ve.
 */
export function Moderar({ publicacion }: { publicacion: PublicacionEnModeracion }) {
  const router = useRouter();
  const [rechazando, setRechazando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bloqueoAprobar = publicacion.esDeQuienModera
    ? "Es tuya: tiene que aprobarla otra persona con rol de administrador."
    : !publicacion.elegibilidad.publicable
      ? `Ya no se puede publicar: ${publicacion.elegibilidad.motivos.join(" ")}`
      : null;

  const aprobar = async () => {
    setOcupado(true);
    setError(null);
    const r = await moderarPublicacion(publicacion.id, { accion: "aprobar", revision: publicacion.revision });
    setOcupado(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-3">
      {bloqueoAprobar && (
        <Alerta tipo={publicacion.esDeQuienModera ? "info" : "bloqueo"} anuncio="ninguno" compacta>
          {bloqueoAprobar}
        </Alerta>
      )}
      <div className="flex flex-wrap gap-2">
        {publicacion.estado !== "aprobada" && (
          <Boton
            tamano="sm"
            icono={<Check className="size-4" />}
            disabled={bloqueoAprobar !== null}
            cargando={ocupado}
            onClick={() => void aprobar()}
          >
            Aprobar
          </Boton>
        )}
        <Boton
          variante="secundario"
          tamano="sm"
          icono={<X className="size-4" />}
          disabled={publicacion.esDeQuienModera}
          onClick={() => setRechazando(true)}
        >
          {publicacion.estado === "aprobada" ? "Retirar de la galería" : "Rechazar"}
        </Boton>
      </div>
      {rechazando && <DialogoRechazo publicacion={publicacion} abierto={rechazando} onAbiertoCambio={setRechazando} />}
      {error && (
        <Alerta tipo="error" titulo="No se ha guardado la decisión">
          {error}
        </Alerta>
      )}
    </div>
  );
}
