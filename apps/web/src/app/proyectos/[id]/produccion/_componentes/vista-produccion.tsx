"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { claseBoton } from "@/components/ui/button";
import { PanelAntesDeGenerar } from "@/components/ui/controles";
import { Aviso, EstadoVacio } from "@/components/ui/feedback";
import { avisosConfirmables, bloqueosDeControles, firmaDeAvisos } from "@/lib/controles";
import { formatearCreditos } from "@/lib/generacion";
import type { ProduccionVista } from "@/lib/produccion";
import { type AlmacenProduccion, crearAlmacenProduccion } from "./almacen-produccion";
import {
  aprobarFotograma,
  autorizarReintentos,
  type ConfirmacionEnvio,
  cancelarEscena,
  producirEscena,
  producirProyecto,
  regenerarEscena,
} from "./api-produccion";
import { ConfirmacionGasto } from "./confirmacion-gasto";
import { TarjetaEscena } from "./tarjeta-escena";

/**
 * Rejilla de producción de un proyecto aprobado (RF06, 0.19.0).
 *
 * Todo el estado vive en un **almacén externo** (`useSyncExternalStore`) que sondea mientras hay algo en vuelo y se
 * para cuando no: en Escenara no se usa `useEffect` directo. Cada acción del servidor devuelve el estado de
 * producción **completo**, así que la pantalla nunca muestra un coste ni un estado que ya no sean los vigentes.
 */
export function VistaProduccion({ inicial }: { inicial: ProduccionVista }) {
  const [almacen] = useState<AlmacenProduccion>(() => crearAlmacenProduccion(inicial));
  const estado = useSyncExternalStore(almacen.subscribe, almacen.obtener, almacen.obtener);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmados, setConfirmados] = useState<string[]>([]);
  const { produccion } = estado;

  const confirmar = (regla: string, valor: boolean) => {
    setConfirmados((previos) => (valor ? [...new Set([...previos, regla])] : previos.filter((r) => r !== regla)));
  };

  /** Ejecuta una acción del servidor y adopta el estado que devuelve. Nunca se compone nada en el navegador. */
  const ejecutar = async (
    accion: () => Promise<{ ok: true; datos: ProduccionVista } | { ok: false; error: string }>,
  ) => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    const resultado = await accion();
    setOcupado(false);
    if (resultado.ok) almacen.aplicar(resultado.datos);
    else setError(resultado.error);
  };

  /** Cancelar devuelve además qué se ha cancelado y qué se cobrará: eso se dice tal cual. */
  const cancelar = async (escenaId: string) => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    const resultado = await cancelarEscena(escenaId);
    setOcupado(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    almacen.aplicar(resultado.datos.estado);
    setAviso(resultado.datos.mensaje);
  };

  const bloqueosDelModelo = bloqueosDeControles(produccion.controlesDelModelo, confirmados);
  const hayAvisos = avisosConfirmables(produccion.controlesDelModelo).length > 0;
  const caben = Math.max(0, produccion.maximoEnVuelo - produccion.enVuelo);
  const deGolpe = Math.min(produccion.porProducir, caben);
  const firmaDeEscenas = produccion.escenas.map((e) => e.fotograma?.id ?? "-").join(",");

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/proyectos/${produccion.proyectoId}`}
            className="text-sm font-semibold text-acento hover:underline"
          >
            ← El plan del proyecto
          </Link>
          <h1 className="mt-1 text-4xl font-bold text-texto">Producción: {produccion.titulo}</h1>
          <p className="mt-2 text-texto-suave">
            {produccion.escenas.length} {produccion.escenas.length === 1 ? "escena" : "escenas"} ·{" "}
            {formatearCreditos(produccion.comprometidoCreditos)} comprometidos de{" "}
            {produccion.presupuestoCreditos > 0
              ? formatearCreditos(produccion.presupuestoCreditos)
              : "un presupuesto sin fijar"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* La revisión de continuidad vive aparte: se mira cuando ya hay clips, no mientras se produce. */}
          <Link href={`/proyectos/${produccion.proyectoId}/revision`} className={claseBoton("secundario", "sm")}>
            Revisar la continuidad
          </Link>
          {/* La voz y los subtítulos también viven aparte: se deciden por proyecto, no escena a escena (0.21.0). */}
          <Link href={`/proyectos/${produccion.proyectoId}/voz`} className={claseBoton("secundario", "sm")}>
            Voz y subtítulos
          </Link>
          <Link href="/crear/historial" className={claseBoton("secundario", "sm")}>
            Historial de trabajos
          </Link>
        </div>
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}
      {aviso && <Aviso tono="info">{aviso}</Aviso>}
      {estado.error && <Aviso tono="error">{estado.error}</Aviso>}

      {produccion.impedimentos.length > 0 && (
        <section className="rounded-tarjeta border-2 border-borde bg-superficie p-4">
          <p className="font-semibold text-texto">Para poder producir falta esto:</p>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-texto-suave">
            {produccion.impedimentos.map((impedimento) => (
              <li key={impedimento}>{impedimento}</li>
            ))}
          </ul>
        </section>
      )}

      {hayAvisos && (
        <PanelAntesDeGenerar
          evaluacion={produccion.controlesDelModelo}
          confirmados={confirmados}
          deshabilitado={ocupado}
          onConfirmar={confirmar}
        />
      )}

      {/* Sin sitio en el tope no se ofrece el lote: un importe de cero escenas no sería una estimación de nada. */}
      {produccion.porProducir > 0 && produccion.impedimentos.length === 0 && deGolpe === 0 && (
        <Aviso tono="info">
          Tienes {produccion.porProducir} {produccion.porProducir === 1 ? "escena" : "escenas"} pendientes y{" "}
          {produccion.enVuelo} produciéndose, que es el máximo de esta instalación. En cuanto termine alguna, vuelve a
          pulsar: nada se pierde.
        </Aviso>
      )}

      {produccion.porProducir > 0 && produccion.impedimentos.length === 0 && deGolpe > 0 && (
        <ConfirmacionGasto
          titulo={
            deGolpe === produccion.porProducir
              ? `Producir las ${produccion.porProducir} escenas pendientes`
              : `Producir ${deGolpe} de las ${produccion.porProducir} escenas pendientes`
          }
          explicacion={`Se encola el fotograma de cada una. Esta instalación permite ${produccion.maximoEnVuelo} ${produccion.maximoEnVuelo === 1 ? "escena" : "escenas"} a la vez, así que el resto espera: nada se pierde y vuelves a pulsar cuando quede sitio. Cada escena aparta su importe por separado, y el clip de cada una se paga después, al aprobar su fotograma.`}
          creditos={produccion.creditosPorFotograma}
          // La cifra principal es lo que se compromete al pulsar: un importe de fotograma no dice lo que cuesta el lote.
          total={{
            creditos: deGolpe * produccion.creditosPorFotograma,
            detalle: `${formatearCreditos(produccion.creditosPorFotograma)} por fotograma × ${deGolpe} ${deGolpe === 1 ? "escena" : "escenas"}`,
          }}
          umbral={produccion.umbralAvisoCreditos}
          sello={produccion.selloFotograma}
          etiqueta={deGolpe <= 1 ? "Producir la escena" : `Producir ${deGolpe} escenas`}
          // El último trabajo de cada escena entra en la firma: después de un fallo, volver a pulsar es otra
          // confirmación y estrena clave, así que el servidor no puede devolver los trabajos que ya fallaron.
          firma={`proyecto|${firmaDeEscenas}|${firmaDeAvisos(confirmados)}`}
          bloqueos={bloqueosDelModelo}
          avisosConfirmados={confirmados}
          avisos={avisosConfirmables(produccion.controlesDelModelo)}
          onConfirmarAviso={confirmar}
          ocupado={ocupado}
          onEnviar={(confirmacion: ConfirmacionEnvio) =>
            void ejecutar(() => producirProyecto(produccion.proyectoId, confirmacion))
          }
        />
      )}

      {produccion.escenas.length === 0 ? (
        <EstadoVacio
          titulo="Este proyecto no tiene escenas"
          texto="Vuelve al plan, escribe su guion y apruébalo: solo entonces se puede producir."
          accion={
            <Link href={`/proyectos/${produccion.proyectoId}`} className={claseBoton("primario")}>
              Ir al plan
            </Link>
          }
        />
      ) : (
        <ol className="flex flex-col gap-5">
          {produccion.escenas.map((escena) => (
            <li key={escena.id}>
              <TarjetaEscena
                escena={escena}
                produccion={produccion}
                ocupado={ocupado}
                avisosConfirmados={confirmados}
                onConfirmarAviso={confirmar}
                onProducir={(c) => void ejecutar(() => producirEscena(escena.id, c))}
                onAprobar={(c) => void ejecutar(() => aprobarFotograma(escena.id, c))}
                onRegenerar={(c) => void ejecutar(() => regenerarEscena(escena.id, c))}
                onCancelar={() => void cancelar(escena.id)}
                onReintentos={(reintentos) => void ejecutar(() => autorizarReintentos(escena.id, reintentos))}
              />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
