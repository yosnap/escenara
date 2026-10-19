"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { Aviso } from "@/components/ui/feedback";
import { formatearCreditos, formatearEuros } from "@/lib/generacion";
import { formatearFecha } from "@/lib/proyectos";
import {
  AYUDA_TIPO_PIEZA,
  type CondicionesVideoCompleto,
  costeDelGuion,
  type DuracionVideo,
  ETIQUETA_TIPO_PIEZA,
  opcionesDeVideoCompleto,
  planDeClips,
  type TipoPieza,
  tipoConDosPersonas,
} from "@/lib/video-completo";

/**
 * **Vídeo completo desde una idea**: qué duración, qué tipo de pieza y con quién habla el protagonista, y lo que
 * cuesta escribir su guion. Sin nombres de modelo: solo duración y créditos.
 *
 * Una opción que no se puede elegir **sale deshabilitada con su motivo**, el mismo con el que la rechazaría el
 * servidor. Las duraciones largas ni aparecen mientras quien administra no las abra.
 *
 * El coste va en su **zona de claridad**: neutra, sin degradados ni movimiento, con la palabra «estimación», la
 * fecha del precio y la llamada de reserva enseñada aparte.
 */

export interface EleccionVideoCompleto {
  /** `null` = escenas sueltas, como hasta ahora. */
  duracion: DuracionVideo | null;
  tipo: TipoPieza;
  segundoPersonajeId: string | null;
}

/** Lo que cuesta una llamada al modelo de texto, tal como lo da la estimación del asistente. */
export interface PrecioDeLlamada {
  creditos: number;
  euros: number;
  comprobado: string;
  /** `true` si se paga por la cuota del plan del usuario en ese servicio: entonces no cuesta créditos. */
  porCuota?: boolean;
  /** Proveedor que lo escribiría; se nombra cuando va por cuota. Nunca el modelo. */
  nombreProveedor?: string;
}

/** «Por la cuota de tu plan en NaN builders»: lo que se dice en lugar de «0 créditos» cuando va por cuota. */
export const fraseDeCuota = (nombreProveedor?: string) =>
  `Por la cuota de tu plan${nombreProveedor ? ` en ${nombreProveedor}` : ""}`;

/** Por qué no se puede escribir el guion con esta elección; `null` si se puede. */
export function motivoDeLaEleccion(c: CondicionesVideoCompleto, e: EleccionVideoCompleto): string | null {
  if (e.duracion === null) return null;
  const opciones = opcionesDeVideoCompleto(c, e.tipo);
  return (
    opciones.motivo ??
    opciones.tipos.find((t) => t.tipo === e.tipo)?.motivo ??
    opciones.duraciones.find((d) => d.duracion === e.duracion)?.motivo ??
    (tipoConDosPersonas(e.tipo) && !e.segundoPersonajeId ? "Elige con quién habla tu protagonista." : null)
  );
}

function BotonOpcion({
  elegido,
  motivo,
  titulo,
  detalle,
  onClick,
}: {
  elegido: boolean;
  motivo: string | null;
  titulo: ReactNode;
  detalle: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={elegido}
      disabled={motivo !== null && !elegido}
      onClick={onClick}
      className={cn(
        "flex min-h-14 items-start gap-3 rounded-tarjeta border-2 p-3 text-left transition-colors duration-(--motion-fast) disabled:cursor-not-allowed disabled:opacity-60",
        elegido ? "border-acento bg-acento/10 text-texto" : "border-borde bg-superficie text-texto",
        motivo === null && !elegido && "hover:border-acento",
      )}
    >
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="font-semibold">{titulo}</span>
        <span className="text-xs text-texto-suave">{motivo ?? detalle}</span>
      </span>
      {elegido && <Check className="size-5 shrink-0 text-acento" aria-hidden />}
    </button>
  );
}

const resumenDelPlan = (duracion: DuracionVideo, tipo: TipoPieza): string => {
  const plan = planDeClips(duracion, tipo);
  const iguales = plan.every((c) => c.segundos === plan[0]?.segundos);
  return iguales
    ? `${plan.length} clips de ${plan[0]?.segundos ?? 0} s`
    : `${plan.length} clips (${plan.map((c) => c.segundos).join(" + ")} s)`;
};

export function SelectorVideoCompleto({
  condiciones,
  eleccion,
  personajes,
  protagonistaId,
  precio,
  deshabilitado,
  onCambio,
}: {
  condiciones: CondicionesVideoCompleto;
  eleccion: EleccionVideoCompleto;
  /** Personajes propios entre los que elegir al segundo; el protagonista no se ofrece. */
  personajes: readonly { id: string; nombre: string }[];
  protagonistaId: string | null;
  /** Precio de una llamada de texto; `null` si el asistente no está disponible. */
  precio: PrecioDeLlamada | null;
  deshabilitado?: boolean;
  onCambio: (eleccion: EleccionVideoCompleto) => void;
}) {
  const opciones = opcionesDeVideoCompleto(condiciones, eleccion.tipo);
  const cambiar = (cambios: Partial<EleccionVideoCompleto>) => onCambio({ ...eleccion, ...cambios });
  const otros = personajes.filter((p) => p.id !== protagonistaId);
  const coste =
    precio && eleccion.duracion !== null ? costeDelGuion(precio.creditos, eleccion.duracion, eleccion.tipo) : null;
  const eurosPorCredito = precio && precio.creditos > 0 ? precio.euros / precio.creditos : 0;

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2" disabled={deshabilitado}>
        <legend className="mb-1 text-sm font-semibold text-texto">Duración del vídeo</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <BotonOpcion
            elegido={eleccion.duracion === null}
            motivo={null}
            titulo="Escenas sueltas"
            detalle="Como hasta ahora: el asistente propone escenas y el diálogo lo escribes tú."
            onClick={() => cambiar({ duracion: null })}
          />
          {opciones.duraciones.map((d) => (
            <BotonOpcion
              key={d.duracion}
              elegido={eleccion.duracion === d.duracion}
              motivo={opciones.motivo ?? d.motivo}
              titulo={`Vídeo completo de ${d.etiqueta}`}
              detalle={`${resumenDelPlan(d.duracion, eleccion.tipo)}, con el diálogo entero escrito de una vez.`}
              onClick={() => cambiar({ duracion: d.duracion })}
            />
          ))}
        </div>
        {opciones.motivo && <p className="text-sm text-texto-suave">{opciones.motivo}</p>}
      </fieldset>

      {eleccion.duracion !== null && (
        <fieldset className="flex flex-col gap-2" disabled={deshabilitado}>
          <legend className="mb-1 text-sm font-semibold text-texto">Tipo de vídeo</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {opciones.tipos.map((t) => (
              <BotonOpcion
                key={t.tipo}
                elegido={eleccion.tipo === t.tipo}
                motivo={t.motivo}
                titulo={ETIQUETA_TIPO_PIEZA[t.tipo]}
                detalle={AYUDA_TIPO_PIEZA[t.tipo]}
                onClick={() => cambiar({ tipo: t.tipo })}
              />
            ))}
          </div>
        </fieldset>
      )}

      {eleccion.duracion !== null && tipoConDosPersonas(eleccion.tipo) && (
        <fieldset className="flex flex-col gap-2" disabled={deshabilitado}>
          <legend className="mb-1 text-sm font-semibold text-texto">Con quién habla tu protagonista</legend>
          {otros.length === 0 ? (
            <Aviso tono="aviso">
              Necesitas otro personaje tuyo para una entrevista o un podcast. Créalo en «Personajes» y vuelve aquí.
            </Aviso>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {otros.map((p) => (
                <BotonOpcion
                  key={p.id}
                  elegido={eleccion.segundoPersonajeId === p.id}
                  motivo={null}
                  titulo={p.nombre}
                  detalle="Sale con tu protagonista y conversan en el vídeo."
                  onClick={() => cambiar({ segundoPersonajeId: p.id })}
                />
              ))}
            </div>
          )}
        </fieldset>
      )}

      {coste && precio?.porCuota && (
        <div className="flex flex-col gap-1 rounded-tarjeta border-2 border-borde bg-superficie p-4">
          <p className="font-semibold text-texto">Lo que cuesta escribir el guion</p>
          <p className="font-mono text-texto">
            {coste.llamadas} {coste.llamadas === 1 ? "llamada" : "llamadas"} de texto, más una de reserva por si hay que
            repetir un trozo
          </p>
          <p className="font-mono font-semibold text-texto">
            {fraseDeCuota(precio.nombreProveedor)}: no cuesta créditos
          </p>
          <p className="text-sm text-texto-suave">
            Ese servicio se paga con la cuota de tu plan y no por petición. Si no responde, no se pasa a ninguna entrada
            de pago de tu mapa: se para y se te dice por qué. El coste de los clips se enseña aparte, antes de producir.
          </p>
        </div>
      )}

      {coste && precio && !precio.porCuota && (
        <div className="flex flex-col gap-1 rounded-tarjeta border-2 border-borde bg-superficie p-4">
          <p className="font-semibold text-texto">Lo que cuesta escribir el guion</p>
          <p className="font-mono text-texto">
            {coste.llamadas} {coste.llamadas === 1 ? "llamada" : "llamadas"} de texto:{" "}
            {formatearCreditos(coste.creditosLlamadas)}
          </p>
          <p className="font-mono text-texto">
            Reserva por si hay que repetir un trozo: {formatearCreditos(coste.creditosReserva)}
          </p>
          <p className="font-mono font-semibold text-texto">
            Total que confirmas: {formatearCreditos(coste.total)} (estimación, precio del{" "}
            {formatearFecha(precio.comprobado)}) ≈ {formatearEuros(coste.total * eurosPorCredito)}
          </p>
          <p className="text-sm text-texto-suave">
            La reserva solo se gasta si un trozo del guion llega cortado o no cabe en sus segundos. Antes de cada
            llamada se suma lo ya cobrado: si la siguiente pudiera pasar del total, no se hace, se para y se te dice
            cuánto ha costado lo hecho. El importe de cada llamada lo informa el proveedor al terminar. El coste de los
            clips se enseña aparte, antes de producir.
          </p>
        </div>
      )}
    </div>
  );
}
