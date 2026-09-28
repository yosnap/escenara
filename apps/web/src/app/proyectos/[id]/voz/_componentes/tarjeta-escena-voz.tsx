"use client";

import { AudioLines, Captions, FileText } from "lucide-react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { formatearCreditos } from "@/lib/generacion";
import type { DisponibilidadVoz, EscenaVozVista, ModoVoz, Subtitulo } from "@/lib/voz";
import { EditorSubtitulos } from "./editor-subtitulos";

/**
 * Una escena en la pantalla de voz y subtítulos (RF08, 0.21.0): su pista de voz cuando el proyecto la use, sus
 * subtítulos y el editor.
 *
 * Nada de lo que hay aquí gasta dinero por su cuenta: generar la voz **exige la confirmación del coste** y lo demás
 * (transcribir, proponer, guardar) no cuesta nada y se dice.
 */
export function TarjetaEscenaVoz({
  escena,
  modo,
  disponibilidad,
  ocupado,
  onGenerarVoz,
  onTranscribir,
  onProponer,
  onGuardar,
}: {
  escena: EscenaVozVista;
  modo: ModoVoz;
  disponibilidad: DisponibilidadVoz;
  ocupado: boolean;
  onGenerarVoz: () => void;
  onTranscribir: () => void;
  onProponer: () => void;
  onGuardar: (subtitulos: Subtitulo[]) => void;
}) {
  const conPista = modo === "pista";
  const origen = conPista ? "la pista de voz" : "el audio del clip";
  const puedeTranscribir =
    disponibilidad.transcripcionDisponible && (conPista ? escena.audio !== null : escena.clip !== null);

  return (
    <article className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-texto">
          Escena {escena.orden}: {escena.resumen}
        </h2>
        <p className="text-sm text-texto-suave">
          {escena.segundos} s ·{" "}
          {escena.subtitulos.length === 0
            ? "sin subtítulos"
            : `${escena.subtitulos.length} ${escena.subtitulos.length === 1 ? "subtítulo" : "subtítulos"}${escena.editados ? " revisados por ti" : " sin revisar"}`}
        </p>
      </header>

      {escena.invalidada && (
        <Aviso tono="error">{escena.invalidacion || "Lo generado ya no corresponde a la voz de este proyecto."}</Aviso>
      )}
      {/* El clip ya producido dice el diálogo en la imagen: no es una invalidación, pero hay que reproducirlo. */}
      {escena.clipHablado && (
        <Aviso tono="info">
          El clip de esta escena se produjo con el diálogo hablado dentro. Vuelve a producirla en Producción para que
          salga sin diálogo: si no, se oirán dos voces diciendo lo mismo.
        </Aviso>
      )}
      {/* Salió bien, pero con el otro proveedor: se dice en qué cuenta se ha gastado y por qué. */}
      {escena.avisoProveedor && !escena.trabajoEnMarcha && <Aviso tono="info">{escena.avisoProveedor}</Aviso>}
      {/* El fallo es **de la voz**, no de la escena: su clip puede estar perfectamente producido. */}
      {escena.fallo && !escena.trabajoEnMarcha && (
        <Aviso tono="error">La última vez que se generó la voz de esta escena falló. {escena.fallo}</Aviso>
      )}
      {escena.trabajoEnMarcha && (
        <Aviso tono="info">La voz de esta escena está en marcha: {escena.trabajoEnMarcha}.</Aviso>
      )}

      {escena.dialogo.trim() === "" ? (
        <p className="text-sm text-texto-suave">
          Esta escena no tiene diálogo, así que no hay nada que decir ni que subtitular.
        </p>
      ) : (
        <p className="rounded-tarjeta border-2 border-borde bg-elevada p-3 text-sm text-texto">
          <span className="font-semibold text-texto-suave">Dice: </span>
          {escena.dialogo}
        </p>
      )}

      {conPista && (
        <section aria-label="Pista de voz" className="flex flex-col gap-2">
          {escena.audio ? (
            // biome-ignore lint/a11y/useMediaCaption: el subtítulo de este audio es justo lo que se edita debajo
            <audio controls src={escena.audio.url} className="w-full" />
          ) : (
            <p className="text-sm text-texto-suave">Esta escena todavía no tiene su pista de voz.</p>
          )}
          {disponibilidad.ttsDisponible ? (
            <div className="flex flex-wrap items-center gap-3">
              <Boton
                variante="secundario"
                tamano="sm"
                icono={<AudioLines />}
                disabled={ocupado || escena.dialogo.trim() === "" || escena.trabajoEnMarcha !== null}
                onClick={onGenerarVoz}
              >
                {escena.audio ? "Regenerar la voz" : "Generar la voz"}
              </Boton>
              <p className="text-sm text-texto-suave">
                {disponibilidad.creditosPorEscena === null
                  ? "Sin precio registrado no se puede estimar el coste, así que no se genera."
                  : `Cuesta ${formatearCreditos(disponibilidad.creditosPorEscena)} estimados. Se te pedirá confirmarlo.`}
              </p>
            </div>
          ) : (
            <Aviso tono="error">{disponibilidad.motivoTts}</Aviso>
          )}
        </section>
      )}

      <section aria-label="Subtítulos" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Boton
            variante="secundario"
            tamano="sm"
            icono={<Captions />}
            disabled={ocupado || !puedeTranscribir}
            onClick={onTranscribir}
          >
            Transcribir {origen}
          </Boton>
          <Boton
            variante="secundario"
            tamano="sm"
            icono={<FileText />}
            disabled={ocupado || escena.dialogo.trim() === ""}
            onClick={onProponer}
          >
            Proponer desde el diálogo
          </Boton>
          <span className="text-sm text-texto-suave">Las dos cosas son locales: no cuestan nada.</span>
        </div>
        {!disponibilidad.transcripcionDisponible && <Aviso tono="error">{disponibilidad.motivoTranscripcion}</Aviso>}

        {/* La clave fuerza a rehacer el editor cuando el servidor devuelve otros subtítulos: lo que se ve siempre es
            lo guardado, nunca un borrador del navegador que ya no corresponda. */}
        <EditorSubtitulos
          key={`${escena.id}:${escena.subtitulos.length}:${escena.subtitulos.map((s) => s.desde).join(",")}`}
          escena={escena}
          ocupado={ocupado}
          onGuardar={onGuardar}
        />
      </section>
    </article>
  );
}
