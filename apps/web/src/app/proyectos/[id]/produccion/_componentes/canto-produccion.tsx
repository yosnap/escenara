"use client";

import { useCanto } from "@/components/ui/canto/use-canto";
import { Aviso } from "@/components/ui/feedback";
import type { EscenaProduccionVista, ProduccionVista } from "@/lib/produccion";
import type { ConfirmacionEnvio } from "./api-produccion";
import { ConfirmacionGasto } from "./confirmacion-gasto";

/** Producción específica del canto: el servidor mide audio, valida retrato y devuelve la tarifa exacta. */
export function CantoProduccion({
  escena,
  produccion,
  ocupado,
  avisosConfirmados,
  onConfirmarAviso,
  onProducir,
}: {
  escena: EscenaProduccionVista;
  produccion: ProduccionVista;
  ocupado: boolean;
  avisosConfirmados: readonly string[];
  onConfirmarAviso: (regla: string, valor: boolean) => void;
  onProducir: (confirmacion: ConfirmacionEnvio) => void;
}) {
  const { canto, error, cargar } = useCanto(escena.id);
  return (
    <div className="flex flex-col gap-4 rounded-tarjeta bg-elevada p-4">
      <h4 className="font-bold text-texto">Clip sincronizado con tu audio</h4>
      {error && <Aviso tono="error">{error}</Aviso>}
      {!canto && !error && <p role="status">Comprobando audio, retrato y precio…</p>}
      {canto && (
        <>
          <p className="text-sm text-texto">
            Audio: <strong>{canto.audio?.nombre ?? "sin elegir"}</strong>. Hasta {canto.segundosMaximos} s; si tu
            archivo es más largo, recórtalo en tu biblioteca y vuelve a elegirlo en la escena.
          </p>
          <p className="text-sm text-texto">
            Retrato del personaje: {canto.retrato.proporcion}.{" "}
            {canto.retrato.vertical
              ? "Vertical válido."
              : "Debe ser más alto que ancho: el modelo no puede forzar 9:16."}
          </p>
          <p className="text-sm text-texto">
            Derechos del audio:{" "}
            {canto.declaracion
              ? `declarados el ${new Date(canto.declaracion.aceptadoEn).toLocaleDateString("es-ES")}`
              : "pendientes de declarar en la escena"}
            . Escenara no comprueba automáticamente los derechos.
          </p>
          {canto.coste && (
            <p className="rounded-control bg-superficie p-3 font-mono text-sm text-texto">
              Estimación: {canto.segundosFacturados} s × {canto.coste.creditosPorSegundo} créditos/s ={" "}
              {canto.coste.creditosAConfirmar} créditos a {canto.resolucion}. Precio comprobado:{" "}
              {canto.coste.comprobado}.
            </p>
          )}
          {canto.impedimentos.length > 0 && (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-texto">
              {canto.impedimentos.map((impedimento) => (
                <li key={impedimento.clave}>
                  {impedimento.motivo} {impedimento.accion}
                </li>
              ))}
            </ul>
          )}
          {escena.animacion?.estado === "listo" && escena.clip && (
            <Aviso tono="correcto">El clip ya está en tu biblioteca.</Aviso>
          )}
          {canto.coste && !escena.clip && (
            <ConfirmacionGasto
              titulo="Generar el clip con tu audio"
              explicacion={`Se pide un clip de ${canto.segundosFacturados} s con la voz de tu archivo. Solo se cobra al confirmar; la reserva es para este clip.`}
              creditos={canto.coste.creditosAConfirmar}
              umbral={produccion.umbralAvisoCreditos}
              sello={canto.coste.sello}
              etiqueta="Confirmar y generar el canto"
              firma={`canto|${escena.id}|${canto.audio?.id ?? ""}|${escena.animacion?.id ?? ""}|${canto.coste.sello}`}
              bloqueos={[
                ...canto.impedimentos.map((i) => `${i.motivo} ${i.accion}`),
                ...(escena.estado === "borrador" ? ["Aprueba la escena y el plan antes de generar."] : []),
                ...(canto.activo ? [] : ["El canto está apagado en Admin › Ajustes."]),
                ...(escena.animacion?.estado === "fallido" && escena.reintentosUsados >= escena.presupuestoReintentos
                  ? ["El intento anterior pudo haberse cobrado. Autoriza un reintento antes de generar otro clip."]
                  : []),
              ]}
              avisos={canto.avisos}
              avisosConfirmados={avisosConfirmados}
              onConfirmarAviso={onConfirmarAviso}
              ocupado={
                ocupado ||
                !canto.activo ||
                (escena.animacion !== null && !["fallido", "cancelado"].includes(escena.animacion.estado))
              }
              onEnviar={onProducir}
            />
          )}
          <button
            type="button"
            className="min-h-6 self-start rounded-control text-sm font-semibold text-acento hover:underline"
            onClick={() => void cargar()}
          >
            Actualizar comprobación del audio y el precio
          </button>
        </>
      )}
    </div>
  );
}
