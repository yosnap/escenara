"use client";

import { ImageOff } from "lucide-react";
import {
  ACCION_MOTIVO,
  clasificarRechazos,
  ETIQUETA_MOTIVO,
  type MotivoRechazo,
  medioIdsSalvables,
  type RechazoDeReferencia,
} from "@/lib/captura-personaje";
import type { Medio } from "@/lib/media/tipos";
import { Boton } from "../button";
import { MiniaturaMedio } from "../media/miniatura-medio";

/**
 * Fotos que el control de calidad ha dejado fuera al añadirlas desde la biblioteca, cada una con su miniatura,
 * qué le pasa y qué hacer.
 *
 * Es un **aviso**, no un error: casi todo lo que se mide se puede usar de todas formas (una foto real recortada
 * sigue siendo suya), así que cada foto salvable lleva su botón, y hay uno para todas cuando son varias. Lo que
 * no se puede saltar —«enorme» y «duplicada»— se explica **sin botón**: ofrecerlo y luego negarlo sería peor.
 *
 * La foto que se guarda así queda **señalada**, y su tarjeta sigue diciendo todo lo que le pasaba: el control
 * previo de generar la vuelve a nombrar, así que nadie se lleva una sorpresa al ver el resultado.
 */
export function FotosRechazadas({
  rechazos,
  medios,
  ocupado,
  onUsarDeTodasFormas,
  onSeguirSinEllas,
}: {
  rechazos: readonly RechazoDeReferencia[];
  /** Fotos de la tanda, para poder poner cara a cada rechazo. Las que no estén salen con su marco vacío. */
  medios: readonly Medio[];
  ocupado: boolean;
  /** Reenvía esas fotos marcadas para usarlas de todas formas. */
  onUsarDeTodasFormas: (medioIds: string[]) => void;
  /** Sigue sin ellas. Si no se pasa, no se ofrece: en la ficha no hay nada que continuar. */
  onSeguirSinEllas?: () => void;
}) {
  if (rechazos.length === 0) return null;
  const { salvables, bloqueantes } = clasificarRechazos(rechazos);
  const todasSalvables = medioIdsSalvables(rechazos);
  const porId = new Map(medios.map((m) => [m.id, m]));

  return (
    <section
      aria-label="Fotos que no se han añadido"
      className="flex flex-col gap-3 rounded-tarjeta border-2 border-aviso/45 bg-superficie p-4"
    >
      <h3 className="font-bold text-texto">
        {rechazos.length === 1 ? "Una foto no se ha añadido todavía" : `${rechazos.length} fotos no se han añadido`}
      </h3>
      <p className="text-sm text-texto-suave">
        {salvables.length > 0 && bloqueantes.length === 0
          ? "Sirven, pero van a guiar algo peor el parecido. Puedes usarlas igualmente: se guardan señaladas y su tarjeta lo sigue diciendo."
          : bloqueantes.length > 0 && salvables.length === 0
            ? "Estas no se pueden usar: no es una cuestión de calidad, es que no se pueden analizar o ya las tienes."
            : "Unas se pueden usar de todas formas y otras no. Cada una dice cuál es su caso."}
      </p>

      <ul className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]">
        {rechazos.map((rechazo) => {
          const medio = porId.get(rechazo.medioId);
          const salvable = salvables.includes(rechazo);
          return (
            <li
              key={`${rechazo.medioId}-${rechazo.motivos.join("-")}`}
              className="flex flex-col gap-2 rounded-tarjeta border border-borde bg-elevada p-2"
            >
              <div className="relative aspect-square overflow-hidden rounded-control bg-superficie">
                {medio ? (
                  <MiniaturaMedio medio={medio} className="object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center text-texto-suave">
                    <ImageOff className="size-8" aria-hidden />
                  </span>
                )}
              </div>
              <p className="truncate text-xs font-semibold text-texto" title={medio?.nombre}>
                {medio?.nombre ?? "Foto de tu biblioteca"}
              </p>
              <MotivosDeFoto motivos={rechazo.motivos} />
              {salvable ? (
                <Boton
                  variante="secundario"
                  tamano="sm"
                  className="self-start"
                  disabled={ocupado}
                  onClick={() => onUsarDeTodasFormas([rechazo.medioId])}
                >
                  Usarla de todas formas
                </Boton>
              ) : (
                <p className="text-xs font-medium text-texto-suave">Esta no se puede añadir de todas formas.</p>
              )}
            </li>
          );
        })}
      </ul>

      {(todasSalvables.length > 1 || onSeguirSinEllas) && (
        <div className="flex flex-wrap gap-2">
          {todasSalvables.length > 1 && (
            <Boton cargando={ocupado} onClick={() => onUsarDeTodasFormas(todasSalvables)}>
              Usar {todasSalvables.length === rechazos.length ? "todas" : `las ${todasSalvables.length}`} de todas
              formas
            </Boton>
          )}
          {onSeguirSinEllas && (
            <Boton variante="fantasma" disabled={ocupado} onClick={onSeguirSinEllas}>
              Seguir sin esas fotos
            </Boton>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Qué le pasa a una foto y qué hacer, motivo a motivo. Lo usan la captura guiada y el alta desde la biblioteca:
 * los dos sitios dicen **exactamente lo mismo** porque leen los mismos textos.
 */
export function MotivosDeFoto({ motivos }: { motivos: readonly MotivoRechazo[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {motivos.map((motivo) => (
        <li key={motivo} className="text-xs text-texto">
          <strong className="font-semibold text-aviso">{ETIQUETA_MOTIVO[motivo]}:</strong> {ACCION_MOTIVO[motivo]}
        </li>
      ))}
    </ul>
  );
}
