"use client";

import { MapPin, MapPinPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso, EstadoVacio } from "@/components/ui/feedback";
import { MiniaturaMedio } from "@/components/ui/media/miniatura-medio";
import { type EstiloAnimado, ETIQUETA_ESTILO_ANIMADO } from "@/lib/animados";
import { type LugarResumen, queFaltaAlLugar, SUGERENCIA_FAMOSO } from "@/lib/lugares";
import { DialogoNuevoLugar } from "./dialogo-nuevo-lugar";

/** Acabado del lugar en palabras: real, o animado con su estilo. */
export const acabadoEnPalabras = (lugar: Pick<LugarResumen, "acabado" | "estilo">): string =>
  lugar.acabado === "realista"
    ? "Real"
    : `Animado · ${ETIQUETA_ESTILO_ANIMADO[lugar.estilo as EstiloAnimado] ?? lugar.estilo}`;

/**
 * Lista de lugares con su maestra, su acabado y lo que les falta para poder generar. Lo que falta va en la tarjeta
 * porque es lo que decide si el lugar sirve: sin maestra o sin declaración, se ve aquí y no al pagar.
 */
export function ListaLugares({ inicial }: { inicial: LugarResumen[] }) {
  const router = useRouter();
  const [creando, setCreando] = useState(false);

  const dialogo = (
    <DialogoNuevoLugar
      abierto={creando}
      onAbiertoCambio={setCreando}
      // Al crearlo se va a su ficha: lo siguiente es añadir las fotos y declarar, y es ahí donde se hace.
      onCreado={(id) => router.push(`/lugares/${id}`)}
    />
  );

  if (inicial.length === 0) {
    return (
      <>
        <EstadoVacio
          nivel={2}
          titulo="Todavía no tienes lugares"
          texto="Un lugar guarda las fotos de un sitio poco conocido —tu calle, el bar de siempre, un patio— para que salga igual en todas tus escenas."
          icono={<MapPin />}
          accion={
            <Boton variante="chispa" onClick={() => setCreando(true)}>
              Crear el primero
            </Boton>
          }
        />
        <Aviso tono="info">{SUGERENCIA_FAMOSO}</Aviso>
        {dialogo}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-texto-suave">{SUGERENCIA_FAMOSO}</p>
        <Boton variante="chispa" onClick={() => setCreando(true)}>
          <MapPinPlus className="size-5" aria-hidden /> Nuevo lugar
        </Boton>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {inicial.map((lugar) => {
          const faltas = queFaltaAlLugar(lugar);
          return (
            <li key={lugar.id}>
              <Link
                href={`/lugares/${lugar.id}`}
                className="flex h-full gap-4 rounded-tarjeta border-2 border-borde/60 bg-superficie p-4 transition-all duration-(--motion-base) hover:-translate-y-0.5 hover:border-acento hover:shadow-lg"
              >
                <span className="flex size-18 shrink-0 items-center justify-center overflow-hidden rounded-control border border-borde bg-elevada">
                  {lugar.portada ? (
                    <MiniaturaMedio medio={lugar.portada} />
                  ) : (
                    <MapPin className="size-8 text-texto-suave" aria-hidden />
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="truncate text-lg font-bold text-texto">{lugar.nombre}</span>
                  <span className="text-sm text-texto-suave">
                    {acabadoEnPalabras(lugar)} ·{" "}
                    {lugar.fotos === 0 ? "sin fotos todavía" : `${lugar.fotos} ${lugar.fotos === 1 ? "foto" : "fotos"}`}
                  </span>
                  {faltas.length > 0 ? (
                    <span className="text-sm font-semibold text-texto">Falta: {faltas.join(" ")}</span>
                  ) : (
                    <span className="text-sm font-semibold text-texto">Listo para usar · versión {lugar.version}</span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {dialogo}
    </>
  );
}
