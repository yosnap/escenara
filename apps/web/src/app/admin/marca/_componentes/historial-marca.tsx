"use client";

import { History, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { fechaYHora } from "@/lib/fechas";
import type { VersionMarcaVista } from "@/lib/marca-vista";

/**
 * Historial de la marca: cada versión que se ha publicado alguna vez, la vigente marcada. **Revertir** la vuelve a
 * publicar tal como era, en un clic (se deshace igual, revirtiendo a la otra). **Volver a la de Escenara** retira la
 * vigente y pide confirmación en el propio botón (un segundo clic).
 */
export function HistorialMarca({
  historial,
  hayPublicada,
  ocupado,
  onRevertir,
  onVolverAEscenara,
}: {
  historial: VersionMarcaVista[];
  hayPublicada: boolean;
  ocupado: boolean;
  onRevertir: (version: VersionMarcaVista) => void;
  onVolverAEscenara: () => void;
}) {
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const pulsar = (clave: string, accion: () => void) => {
    if (confirmando === clave) {
      setConfirmando(null);
      accion();
    } else setConfirmando(clave);
  };

  return (
    <div className="flex flex-col gap-3">
      {historial.length === 0 ? (
        <p className="text-texto-suave">
          Todavía no se ha publicado ninguna versión: la instalación usa la marca de Escenara.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {historial.map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-borde/60 bg-superficie px-4 py-3"
            >
              <div className="flex flex-col">
                <span className="font-semibold text-texto">
                  Versión {v.version} · {v.documento.identity.name}
                  {v.estado === "publicada" && (
                    <span className="ml-2 rounded-full bg-elevada px-2 py-0.5 text-xs font-bold text-correcto">
                      Publicada
                    </span>
                  )}
                </span>
                <span className="text-sm text-texto-suave">
                  {v.publicadaEn ? `Publicada el ${fechaYHora(v.publicadaEn)}` : "Sin publicar"}
                  {v.notas ? ` · ${v.notas}` : ""}
                </span>
              </div>
              {v.estado !== "publicada" && (
                <Boton
                  type="button"
                  variante="secundario"
                  tamano="sm"
                  icono={<RotateCcw className="size-4" />}
                  disabled={ocupado}
                  onClick={() => onRevertir(v)}
                >
                  Revertir a la versión {v.version}
                </Boton>
              )}
            </li>
          ))}
        </ol>
      )}
      {hayPublicada && (
        <div>
          <Boton
            type="button"
            variante={confirmando === "escenara" ? "peligro" : "fantasma"}
            icono={<History className="size-4" />}
            disabled={ocupado}
            onClick={() => pulsar("escenara", onVolverAEscenara)}
          >
            {confirmando === "escenara" ? "Confirmar: volver a la marca de Escenara" : "Volver a la marca de Escenara"}
          </Boton>
        </div>
      )}
    </div>
  );
}
