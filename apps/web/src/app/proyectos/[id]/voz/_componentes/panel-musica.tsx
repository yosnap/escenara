"use client";

import { Music, Trash2 } from "lucide-react";
import { useState } from "react";
import { Boton, BotonIcono } from "@/components/ui/button";
import { AreaTexto } from "@/components/ui/field";
import { Campo } from "@/components/ui/field";
import { NOTA_DERECHOS_MAXIMA, NOTA_DERECHOS_MINIMA, VOLUMEN_MUSICA_POR_DEFECTO, type MusicaVista } from "@/lib/voz";

/**
 * Música de fondo del proyecto (RF08, 0.21.0). **Solo se sube, no se genera**, y **sin declaración de derechos
 * escrita no se añade**: lo impide el servidor, y aquí se dice por qué en lugar de esconder el botón.
 *
 * El identificador del archivo se pega desde la biblioteca: el selector de medios reutilizable llega con el resto de
 * la biblioteca y esta versión no lo adelanta.
 */
export function PanelMusica({
  musica,
  ocupado,
  onAnadir,
  onQuitar,
  onVolumen,
}: {
  musica: MusicaVista[];
  ocupado: boolean;
  onAnadir: (medioId: string, notaDerechos: string, volumen: number) => void;
  onQuitar: (pistaId: string) => void;
  onVolumen: (pistaId: string, volumen: number) => void;
}) {
  const [medioId, setMedioId] = useState("");
  const [nota, setNota] = useState("");
  const [volumen, setVolumen] = useState(VOLUMEN_MUSICA_POR_DEFECTO);
  const completo = medioId.trim() !== "" && nota.trim().length >= NOTA_DERECHOS_MINIMA;

  return (
    <section
      aria-label="Música de fondo"
      className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-5"
    >
      <div>
        <h2 className="text-lg font-bold text-texto">Música de fondo</h2>
        <p className="mt-1 text-sm text-texto-suave">
          La música se sube, no se genera. Para añadirla hay que declarar con qué derecho se usa: de quién es, con qué
          licencia o dónde se compró. Queda guardado con la fecha.
        </p>
      </div>

      {musica.length > 0 && (
        <ul className="flex flex-col gap-3">
          {musica.map((pista) => (
            <li key={pista.id} className="flex flex-col gap-2 rounded-tarjeta border-2 border-borde bg-elevada p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-texto">{pista.medio?.nombreOriginal ?? "Archivo borrado"}</p>
                  <p className="text-sm text-texto-suave">
                    Derechos: {pista.notaDerechos} · declarado el{" "}
                    {new Date(pista.declaradoEn).toLocaleDateString("es-ES")}
                  </p>
                </div>
                <BotonIcono
                  etiqueta="Quitar esta pista del proyecto"
                  icono={<Trash2 />}
                  variante="fantasma"
                  disabled={ocupado}
                  onClick={() => onQuitar(pista.id)}
                />
              </div>
              {pista.medio && (
                // biome-ignore lint/a11y/useMediaCaption: es música de fondo, no tiene diálogo que subtitular
                <audio controls src={pista.medio.url} className="w-full" />
              )}
              <Campo etiqueta={`Volumen: ${Math.round(pista.volumen * 100)} %`} ayuda="Con el que entrará en la mezcla final.">
                {(p) => (
                  <input
                    {...p}
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    defaultValue={pista.volumen}
                    onBlur={(e) => onVolumen(pista.id, Number(e.target.value))}
                    className="h-11 w-full accent-acento"
                  />
                )}
              </Campo>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-elevada p-4">
        <Campo
          etiqueta="Archivo de la biblioteca"
          ayuda="Identificador del audio que ya has subido a tu biblioteca. Tiene que ser un archivo de audio tuyo."
        >
          {(p) => (
            <input
              {...p}
              className="h-11 w-full rounded-control border-2 border-borde bg-superficie px-3 text-texto"
              value={medioId}
              onChange={(e) => setMedioId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          )}
        </Campo>
        <Campo
          etiqueta="Con qué derecho usas esta música"
          ayuda={`Obligatorio, de ${NOTA_DERECHOS_MINIMA} a ${NOTA_DERECHOS_MAXIMA} caracteres. Sin esta declaración la pista no se añade.`}
        >
          {(p) => (
            <AreaTexto
              {...p}
              rows={2}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Es mía, la compuse yo · Licencia CC-BY de … · Comprada en … con licencia comercial"
            />
          )}
        </Campo>
        <Campo etiqueta={`Volumen: ${Math.round(volumen * 100)} %`} ayuda="Se puede cambiar después.">
          {(p) => (
            <input
              {...p}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volumen}
              onChange={(e) => setVolumen(Number(e.target.value))}
              className="h-11 w-full accent-acento"
            />
          )}
        </Campo>
        <Boton
          variante="secundario"
          tamano="sm"
          icono={<Music />}
          disabled={ocupado || !completo}
          onClick={() => onAnadir(medioId.trim(), nota.trim(), volumen)}
        >
          Añadir la música
        </Boton>
        {!completo && (
          <p className="text-sm text-texto-suave">
            Falta el archivo o la declaración de derechos: las dos cosas son obligatorias.
          </p>
        )}
      </div>
    </section>
  );
}
