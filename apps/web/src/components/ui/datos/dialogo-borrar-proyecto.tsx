"use client";

import { useEffect, useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { Dialogo } from "@/components/ui/overlay";
import { borrarProyecto, type ResumenBorradoProyecto, resumenBorradoProyecto } from "./api-datos";

/**
 * Diálogo propio del borrado de un proyecto: **enumera qué desaparece y qué se queda** antes de confirmar, con las
 * cifras del servidor. No se puede deshacer, así que ofrece exportarlo antes.
 */

const n = (cantidad: number, uno: string, varios: string) => `${cantidad} ${cantidad === 1 ? uno : varios}`;

export function lineasBorradoProyecto(r: ResumenBorradoProyecto): { borra: string[]; queda: string[] } {
  return {
    borra: [
      `El proyecto «${r.titulo || "Sin título"}» con ${n(r.escenas, "escena", "escenas")}, su guion, sus revisiones, su brief y su montaje.`,
      `${n(r.trabajos, "trabajo", "trabajos")} de generación de su historial.`,
      ...(r.generados > 0
        ? [
            `${n(r.generados, "fotograma, clip o voz generado", "fotogramas, clips y voces generados")}, con su archivo.`,
          ]
        : []),
      ...(r.videosMontados > 0 ? [`${n(r.videosMontados, "vídeo montado", "vídeos montados")}, con su archivo.`] : []),
      ...(r.paquetesExportados > 0
        ? [`${n(r.paquetesExportados, "paquete ZIP exportado", "paquetes ZIP exportados")}.`]
        : []),
      ...(r.trabajosPorCancelar > 0
        ? [
            `${n(r.trabajosPorCancelar, "trabajo en cola se cancela", "trabajos en cola se cancelan")} y su presupuesto reservado vuelve a estar disponible.`,
          ]
        : []),
    ],
    queda: [
      "Lo que subiste tú (fotos de referencia, audios, música) sigue en tu biblioteca.",
      ...(r.generadosEnUsoFuera > 0
        ? [
            `${n(r.generadosEnUsoFuera, "archivo generado que usas", "archivos generados que usas")} fuera de este proyecto (en un personaje, un producto, un lugar, una colección u otro proyecto).`,
          ]
        : []),
      "Los apuntes de gasto: el gasto ocurrió y sigue en tu historial de la cuenta.",
    ],
  };
}

export function DialogoBorrarProyecto({
  proyectoId,
  titulo,
  abierto,
  onAbiertoCambio,
  onBorrado,
}: {
  proyectoId: string;
  titulo: string;
  abierto: boolean;
  onAbiertoCambio: (abierto: boolean) => void;
  onBorrado: () => void;
}) {
  const [resumen, setResumen] = useState<ResumenBorradoProyecto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);

  // El resumen se pide cada vez que se abre, también si el diálogo se monta ya abierto (se carga al pulsar).
  useEffect(() => {
    if (!abierto) return;
    setError(null);
    setResumen(null);
    resumenBorradoProyecto(proyectoId).then((r) => {
      if (r.ok) setResumen(r.datos);
      else setError(r.error);
    });
  }, [abierto, proyectoId]);

  const confirmar = async () => {
    setBorrando(true);
    setError(null);
    const r = await borrarProyecto(proyectoId);
    setBorrando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onAbiertoCambio(false);
    onBorrado();
  };

  const bloqueado = resumen !== null && (resumen.trabajosEnMarcha > 0 || resumen.procesosEnCurso > 0);
  const lineas = resumen ? lineasBorradoProyecto(resumen) : null;

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoCambio={onAbiertoCambio}
      titulo="¿Borrar el proyecto?"
      descripcion={`Esto es lo que desaparece con «${titulo || "Sin título"}» y lo que se queda. No se puede deshacer.`}
      pie={
        <>
          <Boton variante="fantasma" onClick={() => onAbiertoCambio(false)}>
            Cancelar
          </Boton>
          <Boton variante="peligro" cargando={borrando} disabled={resumen === null || bloqueado} onClick={confirmar}>
            Borrar el proyecto
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {resumen === null && !error && <p className="text-texto-suave">Comprobando qué hay que borrar…</p>}
        {resumen && resumen.trabajosEnMarcha > 0 && (
          <Aviso tono="error">
            {resumen.trabajosEnMarcha === 1
              ? "Hay un trabajo de este proyecto que ya está en el proveedor"
              : `Hay ${resumen.trabajosEnMarcha} trabajos de este proyecto que ya están en el proveedor`}
            : se va a cobrar y su resultado va a llegar, así que no se puede borrar todavía. Espera a que termine.
          </Aviso>
        )}
        {resumen && resumen.procesosEnCurso > 0 && (
          <Aviso tono="error">
            Se está montando un vídeo o preparando un paquete de este proyecto. Espera a que termine para borrarlo.
          </Aviso>
        )}
        {lineas && (
          <>
            <p className="font-semibold text-texto">Se borra:</p>
            <ul className="flex list-inside list-disc flex-col gap-1.5 text-texto">
              {/* alerta-permitida: lo que se borra, no un problema */}
              {lineas.borra.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p className="font-semibold text-texto">Se queda:</p>
            <ul className="flex list-inside list-disc flex-col gap-1.5 text-texto-suave">
              {/* alerta-permitida: lo que se queda, no un problema */}
              {lineas.queda.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p className="text-sm text-texto-suave">
              ¿Lo quieres guardar? Cierra este diálogo y pulsa «Exportar proyecto» antes.
            </p>
          </>
        )}
        {error && <Aviso tono="error">{error}</Aviso>}
      </div>
    </Dialogo>
  );
}
