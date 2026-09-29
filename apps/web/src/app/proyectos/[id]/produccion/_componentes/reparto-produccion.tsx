"use client";

import { Users } from "lucide-react";
import { Aviso } from "@/components/ui/feedback";
import { MiniaturaMedio } from "@/components/ui/media/miniatura-medio";
import { ResumenDeLoPedido, ZonaDeConsentimiento } from "@/components/ui/reparto";
import { formatearCreditos } from "@/lib/generacion";
import { type EscenaProduccionVista, escenaEnVuelo, type ProduccionVista, trabajoEnMarcha } from "@/lib/produccion";
import { ETIQUETA_FORMATO_REPARTO } from "@/lib/reparto";
import {
  avisosDelReparto,
  detalleDeLaEstimacion,
  faltasDelReparto,
  frasesDeLoPedido,
  motivoFormatoApagado,
} from "@/lib/reparto-pantalla";
import type { ConfirmacionEnvio } from "./api-produccion";
import { ConfirmacionGasto } from "./confirmacion-gasto";
import { EsperaEscena } from "./espera-escena";

/**
 * **Producir una escena de dos personajes** (0.28.0): lo que se ha pedido, lo que cuesta cada clip, el total, y una
 * sola confirmación para los dos clips de un podcast.
 *
 * Cuatro reglas de esta versión viven aquí:
 *
 * - **el total es el total**: lo que se enseña y lo que se confirma es la suma de los clips reales (dos en podcast,
 *   uno en dualcast) con el sello del precio con el que se estimó. Confirmar el importe de un solo clip cuando son
 *   dos lo rechaza el servidor, así que la pantalla no puede ofrecerlo;
 * - **se dice que es una estimación y de cuándo es el precio**: lo que se cobra lo decide el proveedor;
 * - **quién falta y qué le falta**: con dos personas reales hacen falta dos consentimientos, y sin los dos no hay
 *   nada que confirmar;
 * - **el prompt no se enseña** (ADR-0022): lo que se previsualiza es una descripción en castellano de lo pedido.
 *
 * Una escena de un personaje no pinta nada de esto: su tarjeta es la de siempre.
 */
export function RepartoProduccion({
  escena,
  produccion,
  ocupado,
  avisosConfirmados,
  bloqueos,
  avisosGenerales,
  onConfirmarAviso,
  onProducir,
  onRegenerar,
}: {
  escena: EscenaProduccionVista;
  produccion: ProduccionVista;
  ocupado: boolean;
  avisosConfirmados: readonly string[];
  bloqueos: readonly string[];
  avisosGenerales: readonly { regla: string; motivo: string }[];
  onConfirmarAviso: (regla: string, valor: boolean) => void;
  onProducir: (confirmacion: ConfirmacionEnvio) => void;
  onRegenerar: (confirmacion: ConfirmacionEnvio) => void;
}) {
  const datos = escena.reparto;
  if (datos === null) return null;
  const { reparto, estimacion } = datos;
  const faltas = faltasDelReparto(datos.personajes);
  const avisos = [
    ...new Map(
      [...avisosGenerales, ...avisosDelReparto(reparto, estimacion)].map((aviso) => [aviso.regla, aviso]),
    ).values(),
  ];
  const pedido = frasesDeLoPedido(reparto);
  // La última pareja de podcast determina si esta confirmación creará la primera versión u otra.
  const clipsPedidos = escena.clipsHablados.length;
  const porPedir =
    estimacion !== null &&
    !escenaEnVuelo(escena) &&
    !escena.clipsHablados.some((clip) => trabajoEnMarcha(clip.trabajo)) &&
    escena.estado !== "borrador";
  const repetir = escena.animacion !== null || clipsPedidos > 0;
  const formatoApagado = motivoFormatoApagado(reparto.formato, {
    podcastActivo: datos.podcastActivo,
    dualcastActivo: datos.dualcastActivo,
  });
  const bloqueosDelEnvio = [
    ...bloqueos,
    ...faltas,
    ...(estimacion?.impedimentos ?? []),
    ...(formatoApagado ? [formatoApagado] : []),
    ...avisos.filter((aviso) => !avisosConfirmados.includes(aviso.regla)).map((aviso) => aviso.motivo),
  ];

  return (
    <section
      aria-label="Reparto de la escena"
      className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-4"
    >
      <h4 className="flex items-center gap-2 font-bold text-texto">
        <Users className="size-4 text-acento" aria-hidden />
        Reparto · {ETIQUETA_FORMATO_REPARTO[reparto.formato]}
      </h4>

      <ResumenDeLoPedido frases={pedido} />

      <ZonaDeConsentimiento
        faltas={faltas}
        sinFaltas="Cada persona real de esta escena tiene su consentimiento registrado."
        comoArreglarlo="Se arregla en la ficha de cada personaje, en «Personajes». Con dos personas reales hacen falta los dos consentimientos, y sin ellos esta escena no se genera."
      />

      {estimacion !== null && estimacion.clips.length > 0 && (
        <div className="flex flex-col gap-1">
          <ul className="flex flex-col gap-1 text-sm">
            {estimacion.clips.map((clip) => (
              <li key={clip.orden} className="flex flex-wrap gap-2">
                <span className="text-texto">
                  Clip {clip.orden}: {clip.nombre}
                </span>
                <span className="text-texto-suave">
                  {clip.turnos === 0 ? "sin turnos" : `${clip.turnos} ${clip.turnos === 1 ? "turno" : "turnos"}`} ·{" "}
                  {estimacion.segundosPorClip} s
                </span>
                <span className="font-mono text-texto">{formatearCreditos(clip.creditos)}</span>
              </li>
            ))}
          </ul>
          <p className="font-mono text-lg font-bold text-texto">
            {formatearCreditos(estimacion.creditos)} (estimación)
          </p>
          <p className="text-sm text-texto-suave">{detalleDeLaEstimacion(estimacion)}</p>
          {estimacion.precioEstimado && (
            <p className="text-sm text-texto-suave">
              El proveedor no publica el precio de un clip de {estimacion.segundosPorClip} s: se ha deducido en
              proporción al que sí publica, así que esta cifra es más insegura que de costumbre.
            </p>
          )}
        </div>
      )}

      {estimacion?.impedimentos.map((impedimento) => (
        <Aviso key={impedimento} tono="error">
          {impedimento}
        </Aviso>
      ))}

      {/*
        Una sola confirmación para los clips de esta escena, por el **total**: es lo que exige el servidor
        (`omni/escena.ts`), que aparta después la reserva de cada clip por separado para que cancelar uno no cobre
        el otro.
      */}
      {porPedir && estimacion !== null && (
        <ConfirmacionGasto
          titulo={
            estimacion.clips.length === 1
              ? `${repetir ? "Volver a producir" : "Producir"} esta escena con los dos personajes`
              : `${repetir ? "Volver a producir" : "Producir"} los ${estimacion.clips.length} clips de esta escena`
          }
          explicacion={
            estimacion.clips.length === 1
              ? "Es un solo clip con los dos en el plano: uno habla y el otro escucha y reacciona. No hay fotograma que aprobar."
              : "Son dos clips, uno por personaje, con el mismo set y la mirada cruzada. Se confirman una vez y se cobra cada uno por separado: cancelar uno antes de enviarlo libera solo su reserva; el otro puede cobrarse."
          }
          creditos={estimacion.creditos}
          total={{ creditos: estimacion.creditos, detalle: detalleDeLaEstimacion(estimacion) }}
          umbral={produccion.umbralAvisoCreditos}
          sello={estimacion.sello}
          etiqueta={
            estimacion.clips.length === 1
              ? repetir
                ? "Generar otra versión del clip"
                : "Generar el clip"
              : repetir
                ? "Generar otra pareja de clips"
                : `Generar los ${estimacion.clips.length} clips`
          }
          firma={`reparto|${escena.id}|${reparto.formato}|${estimacion.sello}|${estimacion.creditos}|${escena.animacion?.id ?? "primera"}|${avisosConfirmados.join(",")}`}
          bloqueos={bloqueosDelEnvio}
          avisosConfirmados={avisosConfirmados}
          avisos={avisos}
          conProducto={escena.conProducto}
          onConfirmarAviso={onConfirmarAviso}
          ocupado={ocupado}
          onEnviar={repetir ? onRegenerar : onProducir}
        />
      )}

      {reparto.formato === "dualcast" && escena.animacion && (
        <div className="flex flex-col gap-2 rounded-control bg-elevada p-3">
          <p className="font-semibold text-texto">Clip de los dos personajes</p>
          {escena.animacion.medio ? (
            <MiniaturaMedio medio={escena.animacion.medio} />
          ) : (
            <EsperaEscena trabajo={escena.animacion} etiqueta="Clip de los dos personajes" />
          )}
        </div>
      )}

      {/*
        Los clips ya pedidos, **en el orden del intercambio** y con el personaje de cada uno. Ese orden es lo que el
        montaje (0.32.0) usa para alternar los planos, así que se enseña aquí para poder comprobarlo antes.
      */}
      {escena.clipsHablados.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-semibold text-texto">Los clips de esta conversación</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {escena.clipsHablados.map((clip) => (
              <li key={clip.trabajo.id} className="flex flex-col gap-1 rounded-control bg-elevada p-3">
                <p className="text-sm font-semibold text-texto">
                  Clip {clip.orden}
                  {clip.nombre === "" ? "" : ` · ${clip.nombre}`}
                </p>
                {clip.trabajo.medio ? (
                  <MiniaturaMedio medio={clip.trabajo.medio} />
                ) : (
                  <EsperaEscena trabajo={clip.trabajo} etiqueta={`Clip ${clip.orden}`} />
                )}
                <p className="text-sm text-texto-suave">
                  Marcado como el turno {clip.orden} de la conversación: el montaje alterna los planos en ese orden.
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
