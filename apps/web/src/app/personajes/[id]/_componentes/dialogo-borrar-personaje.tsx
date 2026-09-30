"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { Dialogo } from "@/components/ui/overlay";
import { borrarPersonaje, consultarBorrado } from "@/components/ui/personajes/api-personajes";
import type { ResumenBorradoPersonaje } from "@/lib/personajes";

/**
 * Diálogo propio del borrado de un personaje: **enumera qué se va a borrar** antes de pedir la confirmación,
 * porque se lleva por delante los vídeos y fotogramas hechos con él y eso no se puede deshacer.
 *
 * El resumen lo da el servidor al abrir el diálogo: contar los derivados en el navegador sería inventárselos.
 */
export function DialogoBorrarPersonaje({
  id,
  nombre,
  abierto,
  onAbiertoCambio,
  onBorrado,
}: {
  id: string;
  nombre: string;
  abierto: boolean;
  onAbiertoCambio: (abierto: boolean) => void;
  onBorrado: () => void;
}) {
  const [resumen, setResumen] = useState<ResumenBorradoPersonaje | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);

  const abrir = async (siguiente: boolean) => {
    onAbiertoCambio(siguiente);
    if (!siguiente) return;
    setError(null);
    setResumen(null);
    const respuesta = await consultarBorrado(id);
    if (respuesta.ok) setResumen(respuesta.datos);
    else setError(respuesta.error);
  };

  const confirmar = async () => {
    setBorrando(true);
    setError(null);
    const respuesta = await borrarPersonaje(id);
    setBorrando(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    onAbiertoCambio(false);
    onBorrado();
  };

  const lineas = resumen
    ? [
        `El personaje «${resumen.nombre}» y su registro de consentimiento.`,
        `${resumen.referencias} ${resumen.referencias === 1 ? "relación con una foto" : "relaciones con fotos"} de tu biblioteca. Las fotos no se borran: siguen en tu biblioteca.`,
        ...(resumen.trabajosPorCancelar > 0
          ? [
              `${resumen.trabajosPorCancelar} ${resumen.trabajosPorCancelar === 1 ? "trabajo" : "trabajos"} que aún no ha salido hacia el proveedor se cancelará y su presupuesto reservado volverá a estar disponible.`,
            ]
          : []),
        resumen.derivados > 0
          ? `${resumen.derivados} ${resumen.derivados === 1 ? "archivo generado" : "archivos generados"} con este personaje (fotogramas y clips), del almacenamiento incluido. Esto no se puede deshacer.`
          : "Ningún archivo generado: todavía no has creado nada con él.",
        `${resumen.trabajos} ${resumen.trabajos === 1 ? "trabajo" : "trabajos"} de su historial de generación.`,
        ...(resumen.conDocumento
          ? [
              "El documento de consentimiento firmado se queda en tu biblioteca: bórralo desde allí si ya no lo quieres.",
            ]
          : []),
      ]
    : [];

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoCambio={abrir}
      titulo="¿Borrar el personaje?"
      descripcion={`Esto es lo que se va a borrar junto con «${nombre}».`}
      pie={
        <>
          <Boton variante="fantasma" onClick={() => onAbiertoCambio(false)}>
            Cancelar
          </Boton>
          <Boton
            variante="peligro"
            cargando={borrando}
            disabled={resumen === null || resumen.trabajosEnMarcha > 0}
            onClick={confirmar}
          >
            Borrar todo
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {resumen === null && !error && <p className="text-texto-suave">Comprobando qué hay que borrar…</p>}
        {resumen && resumen.trabajosEnMarcha > 0 && (
          <Aviso tono="error">
            {resumen.trabajosEnMarcha === 1
              ? "Hay un trabajo de este personaje que ya está en el proveedor"
              : `Hay ${resumen.trabajosEnMarcha} trabajos de este personaje que ya están en el proveedor`}
            : su tarea existe, se va a cobrar y su resultado va a llegar, así que el personaje no se puede borrar
            todavía. Espera a que {resumen.trabajosEnMarcha === 1 ? "termine" : "terminen"}. Si quieres dejar de generar
            con él ya mismo, revoca su consentimiento.
          </Aviso>
        )}
        {lineas.length > 0 && (
          <ul className="flex list-inside list-disc flex-col gap-2 text-texto">
            {/* alerta-permitida: lo que se borrará, no lo que falta */}
            {lineas.map((linea) => (
              <li key={linea}>{linea}</li>
            ))}
          </ul>
        )}
        {error && <Aviso tono="error">{error}</Aviso>}
      </div>
    </Dialogo>
  );
}
