"use client";

import { CheckCircle2 } from "lucide-react";
import { InsigniaControl } from "@/components/ui/controles";
import { Aviso } from "@/components/ui/feedback";
import { SelectorMedios } from "@/components/ui/media/selector-medios";
import { InsigniaEstadoEscena } from "@/components/ui/proyecto";
import { avisosConfirmables, bloqueosDeControles } from "@/lib/controles";
import { formatearCreditos } from "@/lib/generacion";
import {
  clipPorEncolar,
  type EscenaProduccionVista,
  escenaEnVuelo,
  escenaLista,
  fotogramaPorAprobar,
  type ProduccionVista,
  trabajoEnMarcha,
} from "@/lib/produccion";
import { AccionesEscena } from "./acciones-escena";
import type { ConfirmacionEnvio } from "./api-produccion";
import { CantoProduccion } from "./canto-produccion";
import { ConfirmacionGasto } from "./confirmacion-gasto";
import { EsperaEscena } from "./espera-escena";
import { HistorialEscena } from "./historial-escena";
import { PrevisualizacionZonas } from "./previsualizacion-zonas";
import { RepartoProduccion } from "./reparto-produccion";

/**
 * Una escena en la rejilla de producción: su estado real, su fotograma, su clip, lo que cuesta y lo que ha costado,
 * y las acciones que caben ahora mismo.
 *
 * Lo que la tarjeta **no** hace: adivinar. Si hay un trabajo en marcha, muestra sus etapas reales; si hay un
 * fotograma listo, lo muestra para que una persona lo apruebe (animar cuesta otro dinero y no se autoriza solo); y
 * si algo falló, dice qué pasó y ofrece autorizar reintentos, nunca reintentar por su cuenta.
 */
export function TarjetaEscena({
  escena,
  produccion,
  ocupado,
  onProducir,
  onProducirCanto,
  onAprobar,
  onRegenerar,
  onOtroClip,
  onFotogramaDeBiblioteca,
  onCancelar,
  onReintentos,
  onConfirmarAviso,
  avisosConfirmados,
}: {
  escena: EscenaProduccionVista;
  produccion: ProduccionVista;
  ocupado: boolean;
  onProducir: (confirmacion: ConfirmacionEnvio) => void;
  onProducirCanto: (confirmacion: ConfirmacionEnvio) => void;
  onAprobar: (confirmacion: ConfirmacionEnvio) => void;
  onRegenerar: (confirmacion: ConfirmacionEnvio) => void;
  /** Otro clip con el mismo fotograma aprobado, con la dirección de ahora. No toca los anteriores. */
  onOtroClip: (confirmacion: ConfirmacionEnvio) => void;
  /** Toma una imagen de la biblioteca como fotograma de partida. No gasta nada. */
  onFotogramaDeBiblioteca: (medioId: string) => void;
  onCancelar: () => void;
  onReintentos: (reintentos: number) => void;
  /** Confirma un aviso salvable: la misma confirmación que el panel «Antes de generar» de la producción. */
  onConfirmarAviso: (regla: string, valor: boolean) => void;
  avisosConfirmados: readonly string[];
}) {
  const bloqueos = [
    ...bloqueosDeControles(escena.controles, avisosConfirmados),
    ...bloqueosDeControles(produccion.controlesDelModelo, avisosConfirmados),
  ];
  const firma = [escena.id, ...avisosConfirmados].join("|");
  // Los avisos que frenan a esta escena, sin repetir regla: los suyos y los del modelo y el protagonista.
  const avisosFotograma = [
    ...new Map(
      [...avisosConfirmables(escena.controles), ...avisosConfirmables(produccion.controlesDelModelo)].map((a) => [
        a.regla,
        a,
      ]),
    ).values(),
  ];
  const avisosClip = [
    ...new Map(
      [
        ...avisosFotograma,
        ...(escena.controlesDelProductoClip ? avisosConfirmables(escena.controlesDelProductoClip) : []),
      ].map((a) => [a.regla, a]),
    ).values(),
  ];
  const bloqueosClip = [
    ...bloqueos,
    ...(escena.controlesDelProductoClip ? bloqueosDeControles(escena.controlesDelProductoClip, avisosConfirmados) : []),
  ];
  const enVuelo = escenaEnVuelo(escena);
  const lista = escenaLista(escena);
  const sinProducir = escena.fotograma === null;
  const fotogramaListo = escena.fotograma?.estado === "listo" && escena.fotograma.medio !== null;
  const puedeAprobar =
    escena.reparto === null &&
    (fotogramaPorAprobar(escena) || clipPorEncolar(escena)) &&
    !trabajoEnMarcha(escena.animacion);
  const puedePedirOtroClip =
    escena.reparto === null &&
    escena.clip !== null &&
    !trabajoEnMarcha(escena.animacion) &&
    escena.fotogramaAprobado !== null;

  return (
    <article className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-texto-suave">Escena {escena.orden}</p>
          <h3 className="text-lg font-bold text-texto">{escena.resumen}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lista && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-correcto/45 px-2.5 py-0.5 text-sm font-semibold text-correcto">
              <CheckCircle2 className="size-4" aria-hidden />
              <span>Escena lista</span>
            </span>
          )}
          <InsigniaEstadoEscena estado={escena.estado} />
          <InsigniaControl estado={escena.controles.estado} breve />
        </div>
      </header>

      {escena.cambiadaDesdeLaGeneracion && (
        <Aviso tono="aviso">
          Has editado esta escena después de generarla, así que lo que se ve ya no corresponde a lo que dice. Lo
          generado sigue en tu biblioteca: regenera la escena cuando quieras ponerla al día.
        </Aviso>
      )}
      {escena.motivoUltimoFallo !== "" && <Aviso tono="error">{escena.motivoUltimoFallo}</Aviso>}

      {escena.formatoClip === "cantar" && (
        <CantoProduccion
          escena={escena}
          produccion={produccion}
          ocupado={ocupado}
          avisosConfirmados={avisosConfirmados}
          onConfirmarAviso={onConfirmarAviso}
          onProducir={onProducirCanto}
        />
      )}
      {escena.formatoClip !== "cantar" && (
        <>
          <div className={escena.reparto === null ? "grid gap-4 sm:grid-cols-2" : "hidden"}>
            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold text-texto-suave">Fotograma</h4>
              {escena.fotogramaAprobado ? (
                <PrevisualizacionZonas medio={escena.fotogramaAprobado} etiqueta="Fotograma aprobado" />
              ) : escena.fotograma?.medio ? (
                <PrevisualizacionZonas medio={escena.fotograma.medio} etiqueta="Fotograma generado" />
              ) : escena.fotograma ? (
                <EsperaEscena trabajo={escena.fotograma} etiqueta="Fotograma" />
              ) : (
                <p className="text-sm text-texto-suave">Todavía no se ha generado.</p>
              )}
              {/*
            Empezar por una imagen que ya tienes: un fotograma de otro día, una vista del personaje o una foto
            tuya. Elegirla **no gasta nada**; lo único que se paga después es el clip.
          */}
              {!escena.fotogramaAprobado && escena.estado !== "producida" && !enVuelo && (
                <SelectorMedios
                  etiqueta="O usa una imagen tuya como fotograma"
                  ayuda="Se toma tal cual como primer fotograma del clip, sin generar ninguno ni pagar por él."
                  tipos={["imagen"]}
                  sinDocumentos
                  valor={[]}
                  onCambio={(medios) => {
                    const elegida = medios[0];
                    if (elegida) onFotogramaDeBiblioteca(elegida.id);
                  }}
                />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold text-texto-suave">Clip</h4>
              {escena.clip ? (
                <PrevisualizacionZonas medio={escena.clip} etiqueta="Clip de la escena" />
              ) : escena.animacion ? (
                <EsperaEscena trabajo={escena.animacion} etiqueta="Clip" />
              ) : (
                <p className="text-sm text-texto-suave">
                  Se anima cuando apruebes su fotograma: animar es otro gasto y lo autorizas tú.
                </p>
              )}
            </div>
          </div>

          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-texto-suave">Estimado de la escena:</dt>
              <dd className="font-mono text-texto">{formatearCreditos(escena.creditosEstimados)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-texto-suave">Consumido según el proveedor:</dt>
              <dd className="font-mono text-texto">{formatearCreditos(escena.creditosConsumidos)}</dd>
            </div>
            {escena.presupuestoReintentos > 0 && (
              <div className="flex gap-2">
                <dt className="text-texto-suave">Reintentos:</dt>
                <dd className="font-mono text-texto">
                  {escena.reintentosUsados} de {escena.presupuestoReintentos}
                </dd>
              </div>
            )}
          </dl>

          {/*
        Escena de **dos personajes** (0.28.0): su reparto, lo que cuesta cada clip, el total y una sola confirmación
        para los dos clips de un podcast. Se lleva también la confirmación de producir, que en una escena hablada no
        es «generar el fotograma»: no hay fotograma.
      */}
          <RepartoProduccion
            escena={escena}
            produccion={produccion}
            ocupado={ocupado}
            avisosConfirmados={avisosConfirmados}
            bloqueos={bloqueos}
            avisosGenerales={avisosFotograma}
            onConfirmarAviso={onConfirmarAviso}
            onProducir={onProducir}
            onRegenerar={onRegenerar}
          />

          {escena.reparto === null && !enVuelo && sinProducir && escena.estado !== "borrador" && (
            <ConfirmacionGasto
              titulo="Producir esta escena"
              explicacion="Se encola su fotograma. El clip llega después, cuando apruebes el fotograma."
              creditos={produccion.creditosPorFotograma}
              umbral={produccion.umbralAvisoCreditos}
              sello={produccion.selloFotograma}
              etiqueta="Generar el fotograma"
              firma={`producir|${firma}`}
              bloqueos={bloqueos}
              avisosConfirmados={avisosConfirmados}
              avisos={avisosFotograma}
              conProducto={escena.conProducto}
              onConfirmarAviso={onConfirmarAviso}
              ocupado={ocupado}
              onEnviar={onProducir}
            />
          )}

          {/* También cuando el fotograma ya está aprobado y se quedó sin clip: su envío se pudo rechazar, y la salida
          no puede ser regenerar el fotograma y pagarlo otra vez. */}
          {puedeAprobar && (
            <ConfirmacionGasto
              titulo={
                escena.faltaInsertarCaptura
                  ? "Aprobar la pantalla apagada e insertar tu captura"
                  : escena.fotogramaAprobado
                    ? "Animar el fotograma aprobado"
                    : "Aprobar el fotograma y animarlo"
              }
              explicacion={
                escena.faltaInsertarCaptura
                  ? "Este es el paso 1 del producto digital: el dispositivo con la pantalla apagada. Al aprobarlo se encola el paso 2, que mete tu captura dentro de esa pantalla con su perspectiva y sin recortarla. El clip llega después, cuando apruebes el resultado."
                  : escena.fotogramaAprobado
                    ? `Este fotograma ya está aprobado y todavía no tiene clip: se encola su clip de ${escena.segundos} s en 9:16.`
                    : `Al aprobarlo se encola su clip de ${escena.segundos} s en 9:16. Míralo con las zonas seguras antes de decidir.`
              }
              // El paso de la inserción es un fotograma, así que cuesta lo que un fotograma y no lo que un clip.
              creditos={escena.faltaInsertarCaptura ? produccion.creditosPorFotograma : produccion.creditosPorClip}
              umbral={produccion.umbralAvisoCreditos}
              sello={escena.faltaInsertarCaptura ? produccion.selloFotograma : produccion.selloClip}
              etiqueta={
                escena.faltaInsertarCaptura
                  ? "Insertar la captura"
                  : escena.fotogramaAprobado
                    ? "Animar el fotograma"
                    : "Aprobar y animar"
              }
              // La última animación entra en la firma: tras un clip fallido, volver a animar es otra confirmación.
              firma={`aprobar|${escena.fotograma?.id ?? ""}|${escena.animacion?.id ?? ""}|${avisosConfirmados.join(",")}`}
              bloqueos={bloqueosClip}
              avisosConfirmados={avisosConfirmados}
              avisos={avisosClip}
              conProducto={escena.conProducto}
              onConfirmarAviso={onConfirmarAviso}
              ocupado={ocupado}
              onEnviar={onAprobar}
            />
          )}

          {/*
        Otro clip con el mismo fotograma: para probar otra dirección o cambiar el texto no hace falta volver a
        generar —ni a pagar— el fotograma. Lo que ya hay no se sustituye: sigue en tu biblioteca y en el historial.
      */}
          {puedePedirOtroClip && (
            <ConfirmacionGasto
              titulo="Otro clip con este fotograma"
              explicacion={`Se encola otro clip de ${escena.segundos} s del mismo fotograma, con la dirección y el texto que tiene ahora la escena. El clip anterior no se borra: se conserva en tu biblioteca y en el historial.`}
              creditos={produccion.creditosPorClip}
              umbral={produccion.umbralAvisoCreditos}
              sello={produccion.selloClip}
              etiqueta="Generar otro clip"
              firma={`otro-clip|${escena.fotogramaAprobado?.id ?? ""}|${escena.animacion?.id ?? ""}|${avisosConfirmados.join(",")}`}
              bloqueos={bloqueosClip}
              avisosConfirmados={avisosConfirmados}
              avisos={avisosClip}
              conProducto={escena.conProducto}
              onConfirmarAviso={onConfirmarAviso}
              ocupado={ocupado}
              onEnviar={onOtroClip}
            />
          )}

          {/* En una escena de dos personajes no hay fotograma que regenerar: lo que se pide otra vez son sus clips. */}
          {escena.reparto === null && !enVuelo && (fotogramaListo || escena.motivoUltimoFallo !== "" || lista) && (
            <ConfirmacionGasto
              titulo="Regenerar solo esta escena"
              explicacion="Se encola otro fotograma de esta escena y nada más: las demás no se tocan. Lo generado antes se conserva en su historial y en tu biblioteca."
              creditos={produccion.creditosPorFotograma}
              umbral={produccion.umbralAvisoCreditos}
              sello={produccion.selloFotograma}
              etiqueta="Regenerar la escena"
              firma={`regenerar|${escena.fotograma?.id ?? ""}|${avisosConfirmados.join(",")}`}
              bloqueos={bloqueos}
              avisosConfirmados={avisosConfirmados}
              avisos={avisosFotograma}
              conProducto={escena.conProducto}
              onConfirmarAviso={onConfirmarAviso}
              ocupado={ocupado}
              onEnviar={onRegenerar}
            />
          )}
        </>
      )}

      {escena.formatoClip === "cantar" &&
        (escena.clip ? (
          <PrevisualizacionZonas medio={escena.clip} etiqueta="Clip cantado" />
        ) : escena.animacion ? (
          <EsperaEscena trabajo={escena.animacion} etiqueta="Clip cantado" />
        ) : null)}

      <AccionesEscena escena={escena} ocupado={ocupado} onCancelar={onCancelar} onReintentos={onReintentos} />
      <HistorialEscena versiones={escena.versiones} />
    </article>
  );
}
