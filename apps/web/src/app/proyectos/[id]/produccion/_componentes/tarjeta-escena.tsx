"use client";

import { CheckCircle2 } from "lucide-react";
import { InsigniaControl } from "@/components/ui/controles";
import { Aviso } from "@/components/ui/feedback";
import { InsigniaEstadoEscena } from "@/components/ui/proyecto";
import { bloqueosDeControles } from "@/lib/controles";
import { formatearCreditos } from "@/lib/generacion";
import {
  type EscenaProduccionVista,
  escenaEnVuelo,
  escenaLista,
  fotogramaPorAprobar,
  type ProduccionVista,
  trabajoEnMarcha,
} from "@/lib/produccion";
import { AccionesEscena } from "./acciones-escena";
import type { ConfirmacionEnvio } from "./api-produccion";
import { ConfirmacionGasto } from "./confirmacion-gasto";
import { EsperaEscena } from "./espera-escena";
import { HistorialEscena } from "./historial-escena";
import { PrevisualizacionZonas } from "./previsualizacion-zonas";

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
  onAprobar,
  onRegenerar,
  onCancelar,
  onReintentos,
  avisosConfirmados,
}: {
  escena: EscenaProduccionVista;
  produccion: ProduccionVista;
  ocupado: boolean;
  onProducir: (confirmacion: ConfirmacionEnvio) => void;
  onAprobar: (confirmacion: ConfirmacionEnvio) => void;
  onRegenerar: (confirmacion: ConfirmacionEnvio) => void;
  onCancelar: () => void;
  onReintentos: (reintentos: number) => void;
  avisosConfirmados: readonly string[];
}) {
  const bloqueos = [
    ...bloqueosDeControles(escena.controles, avisosConfirmados),
    ...bloqueosDeControles(produccion.controlesDelModelo, avisosConfirmados),
  ];
  const firma = [escena.id, ...avisosConfirmados].join("|");
  const enVuelo = escenaEnVuelo(escena);
  const lista = escenaLista(escena);
  const sinProducir = escena.fotograma === null;
  const fotogramaListo = escena.fotograma?.estado === "listo" && escena.fotograma.medio !== null;

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
        <Aviso tono="info">
          Has editado esta escena después de generarla, así que lo que se ve ya no corresponde a lo que dice. Lo
          generado sigue en tu biblioteca: regenera la escena cuando quieras ponerla al día.
        </Aviso>
      )}
      {escena.motivoUltimoFallo !== "" && <Aviso tono="error">{escena.motivoUltimoFallo}</Aviso>}

      <div className="grid gap-4 sm:grid-cols-2">
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

      {!enVuelo && sinProducir && escena.estado !== "borrador" && (
        <ConfirmacionGasto
          titulo="Producir esta escena"
          explicacion="Se encola su fotograma. El clip llega después, cuando apruebes el fotograma."
          creditos={produccion.creditosPorFotograma}
          sello={produccion.selloFotograma}
          etiqueta="Generar el fotograma"
          firma={`producir|${firma}`}
          bloqueos={bloqueos}
          avisosConfirmados={avisosConfirmados}
          ocupado={ocupado}
          onEnviar={onProducir}
        />
      )}

      {fotogramaPorAprobar(escena) && !trabajoEnMarcha(escena.animacion) && (
        <ConfirmacionGasto
          titulo="Aprobar el fotograma y animarlo"
          explicacion="Al aprobarlo se encola su clip de 4 s en 9:16. Míralo con las zonas seguras antes de decidir."
          creditos={produccion.creditosPorClip}
          sello={produccion.selloClip}
          etiqueta="Aprobar y animar"
          firma={`aprobar|${escena.fotograma?.id ?? ""}|${avisosConfirmados.join(",")}`}
          bloqueos={bloqueos}
          avisosConfirmados={avisosConfirmados}
          ocupado={ocupado}
          onEnviar={onAprobar}
        />
      )}

      {!enVuelo && (fotogramaListo || escena.motivoUltimoFallo !== "" || lista) && (
        <ConfirmacionGasto
          titulo="Regenerar solo esta escena"
          explicacion="Se encola otro fotograma de esta escena y nada más: las demás no se tocan. Lo generado antes se conserva en su historial y en tu biblioteca."
          creditos={produccion.creditosPorFotograma}
          sello={produccion.selloFotograma}
          etiqueta="Regenerar la escena"
          firma={`regenerar|${escena.fotograma?.id ?? ""}|${avisosConfirmados.join(",")}`}
          bloqueos={bloqueos}
          avisosConfirmados={avisosConfirmados}
          ocupado={ocupado}
          onEnviar={onRegenerar}
        />
      )}

      <AccionesEscena escena={escena} ocupado={ocupado} onCancelar={onCancelar} onReintentos={onReintentos} />
      <HistorialEscena versiones={escena.versiones} />
    </article>
  );
}
