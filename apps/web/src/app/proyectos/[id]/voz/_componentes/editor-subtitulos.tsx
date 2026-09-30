"use client";

import { Plus, SplitSquareVertical, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Boton, BotonIcono } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, EntradaTexto } from "@/components/ui/field";
import {
  avisosDeSubtitulos,
  CARACTERES_POR_LINEA,
  dividirEnLineas,
  type EscenaVozVista,
  erroresPorSubtitulo,
  type Subtitulo,
  ZONA_SEGURA,
} from "@/lib/voz";

/**
 * Editor de subtítulos de una escena (RF08, 0.21.0): texto, tiempos, división de líneas y previsualización sobre el
 * clip con las zonas seguras de las plataformas verticales.
 *
 * **Lo que se guarda aquí es lo que se exporta**, así que los tiempos se validan antes de enviar y se dice cuál
 * falla. Los avisos de legibilidad (línea larga, tres líneas, demasiado rápido) **no bloquean**: quien edita puede
 * tener sus razones, y un editor que no deja guardar por un aviso es un editor que se sortea escribiendo peor.
 */
/**
 * Subtítulo mientras se edita. `clave` no se guarda ni se envía: es la identidad de la fila en la lista, para que
 * React no reutilice el contenido de una fila en otra cuando se borra una del medio.
 */
interface LineaEditable extends Subtitulo {
  clave: string;
}

/**
 * Las claves de las filas que llegan ya hechas salen de su posición, no de un contador global: la clave forma parte
 * de los `id` del DOM y un contador compartido entre peticiones daría al servidor y al cliente números distintos
 * (fallo de hidratación). Solo las filas añadidas después, ya en el cliente, usan un contador propio del editor.
 */
const conClave = (subtitulos: readonly Subtitulo[]): LineaEditable[] =>
  subtitulos.map((s, i) => ({ ...s, clave: `subtitulo-${i}` }));

const sinClave = ({ desde, hasta, texto }: LineaEditable): Subtitulo => ({ desde, hasta, texto });

export function EditorSubtitulos({
  escena,
  ocupado,
  onGuardar,
}: {
  escena: EscenaVozVista;
  ocupado: boolean;
  onGuardar: (subtitulos: Subtitulo[]) => void;
}) {
  const idBase = useId();
  const filasNuevas = useRef(0);
  const [lineas, setLineas] = useState<LineaEditable[]>(() => conClave(escena.subtitulos));
  const [activa, setActiva] = useState(0);
  const erroresPorLinea = erroresPorSubtitulo(lineas);
  const errores = erroresPorLinea.map((e) => e.motivo);
  const avisos = avisosDeSubtitulos(lineas);
  /**
   * Lo que describe cada campo de una línea: sus errores (debajo de la línea, con `aria-invalid`) y, en el texto,
   * también sus avisos de legibilidad. Así el lector de pantalla lo dice al llegar al campo, no solo en el resumen.
   */
  const idMensaje = (clave: string, tipo: "error" | "aviso", k: number) => `${idBase}-${clave}-${tipo}-${k}`;
  const describe = (indice: number, clave: string, campo: "tiempo" | "texto") => {
    const ids = erroresPorLinea
      .filter((e) => e.indice === indice)
      .flatMap((e, k) => (e.campo === campo ? [idMensaje(clave, "error", k)] : []));
    if (campo === "texto") {
      ids.push(...avisos.filter((a) => a.indice === indice).map((_, k) => idMensaje(clave, "aviso", k)));
    }
    return {
      "aria-describedby": ids.join(" ") || undefined,
      "aria-invalid": ids.some((id) => id.includes("-error-")) || undefined,
    };
  };
  const actual = lineas[Math.min(activa, Math.max(0, lineas.length - 1))] ?? null;

  const cambiar = (indice: number, cambios: Partial<Subtitulo>) =>
    setLineas(lineas.map((l, i) => (i === indice ? { ...l, ...cambios } : l)));

  const anadir = () => {
    const ultima = lineas.at(-1);
    const desde = ultima ? ultima.hasta : 0;
    setLineas([
      ...lineas,
      { desde, hasta: Math.min(escena.segundos, desde + 1.5), texto: "", clave: `nuevo-${++filasNuevas.current}` },
    ]);
    setActiva(lineas.length);
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {lineas.length === 0 && (
          <p className="text-sm text-texto-suave">
            Esta escena no tiene subtítulos todavía. Transcribe su audio, propónlos desde el diálogo o añádelos a mano.
          </p>
        )}
        {lineas.map((linea, indice) => (
          <div key={linea.clave} className="flex flex-col gap-2 rounded-tarjeta border-2 border-borde bg-elevada p-3">
            <div className="flex items-end gap-2">
              <label
                htmlFor={`${idBase}-${linea.clave}-desde`}
                className="flex flex-col gap-1 text-xs font-semibold text-texto-suave"
              >
                Desde (s)
                <EntradaTexto
                  id={`${idBase}-${linea.clave}-desde`}
                  type="number"
                  min={0}
                  max={escena.segundos}
                  step={0.05}
                  className="w-24"
                  value={linea.desde}
                  onChange={(e) => cambiar(indice, { desde: Number(e.target.value) })}
                  onFocus={() => setActiva(indice)}
                  {...describe(indice, linea.clave, "tiempo")}
                />
              </label>
              <label
                htmlFor={`${idBase}-${linea.clave}-hasta`}
                className="flex flex-col gap-1 text-xs font-semibold text-texto-suave"
              >
                Hasta (s)
                <EntradaTexto
                  id={`${idBase}-${linea.clave}-hasta`}
                  type="number"
                  min={0}
                  max={escena.segundos}
                  step={0.05}
                  className="w-24"
                  value={linea.hasta}
                  onChange={(e) => cambiar(indice, { hasta: Number(e.target.value) })}
                  onFocus={() => setActiva(indice)}
                  {...describe(indice, linea.clave, "tiempo")}
                />
              </label>
              <div className="ml-auto flex gap-1">
                <BotonIcono
                  etiqueta={`Dividir en líneas de ${CARACTERES_POR_LINEA} caracteres`}
                  onClick={() => cambiar(indice, { texto: dividirEnLineas(linea.texto) })}
                >
                  <SplitSquareVertical />
                </BotonIcono>
                <BotonIcono
                  etiqueta="Quitar este subtítulo"
                  onClick={() => setLineas(lineas.filter((_, i) => i !== indice))}
                >
                  <Trash2 />
                </BotonIcono>
              </div>
            </div>
            <AreaTexto
              rows={2}
              value={linea.texto}
              onChange={(e) => cambiar(indice, { texto: e.target.value })}
              onFocus={() => setActiva(indice)}
              aria-label={`Texto del subtítulo ${indice + 1}`}
              {...describe(indice, linea.clave, "texto")}
            />
            {erroresPorLinea
              .filter((e) => e.indice === indice)
              .map((e, k) => (
                // alerta-permitida: mensaje de un campo, debajo de la línea y ligado con aria-describedby
                <p key={e.motivo} id={idMensaje(linea.clave, "error", k)} className="text-xs font-medium text-error">
                  {e.motivo}
                </p>
              ))}
            {avisos
              .filter((a) => a.indice === indice)
              .map((a, k) => (
                <p key={a.motivo} id={idMensaje(linea.clave, "aviso", k)} className="text-xs text-texto-suave">
                  {a.motivo}
                </p>
              ))}
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <Boton variante="secundario" tamano="sm" icono={<Plus />} onClick={anadir}>
            Añadir subtítulo
          </Boton>
          <Boton tamano="sm" disabled={ocupado || errores.length > 0} onClick={() => onGuardar(lineas.map(sinClave))}>
            Guardar los subtítulos
          </Boton>
        </div>
        {errores.length > 0 && <Aviso tono="error">{errores.join(" ")}</Aviso>}
      </div>

      <PrevisualizacionSubtitulo escena={escena} subtitulo={actual} />
    </div>
  );
}

/**
 * Previsualización del subtítulo sobre el clip, con las **zonas seguras** de las plataformas verticales dibujadas:
 * lo de arriba lo tapa la interfaz de la app y lo de abajo, sus botones. Sin verlas, es fácil colocar un subtítulo
 * donde nadie lo va a leer.
 */
function PrevisualizacionSubtitulo({ escena, subtitulo }: { escena: EscenaVozVista; subtitulo: Subtitulo | null }) {
  return (
    <figure className="flex w-full shrink-0 flex-col gap-2 lg:w-64">
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-tarjeta border-2 border-borde bg-elevada">
        {escena.clip ? (
          // biome-ignore lint/a11y/useMediaCaption: es la previsualización del propio subtítulo que se está editando
          <video src={escena.clip.url} muted playsInline className="size-full object-cover" />
        ) : (
          <p className="flex size-full items-center justify-center p-3 text-center text-xs text-texto-suave">
            Cuando esta escena tenga su clip, el subtítulo se verá encima.
          </p>
        )}
        {/* Zonas seguras: se dibujan siempre, también sin clip, porque son del formato y no del vídeo. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 border-b-2 border-dashed border-aviso/70 bg-aviso/10"
          style={{ height: `${ZONA_SEGURA.arribaPorCiento}%` }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 border-t-2 border-dashed border-aviso/70 bg-aviso/10"
          style={{ height: `${ZONA_SEGURA.abajoPorCiento}%` }}
        />
        {subtitulo && subtitulo.texto.trim() !== "" && (
          <p
            className="pointer-events-none absolute inset-x-2 whitespace-pre-line rounded-control bg-black/70 px-2 py-1 text-center text-[0.65rem] leading-tight font-semibold text-white"
            style={{ bottom: `${ZONA_SEGURA.abajoPorCiento + 2}%` }}
          >
            {subtitulo.texto}
          </p>
        )}
      </div>
      <figcaption className="text-xs text-texto-suave">
        Zonas rayadas: lo que tapa la aplicación en vertical. El subtítulo se coloca justo encima de la de abajo.
        {subtitulo && ` Se ve de ${subtitulo.desde} s a ${subtitulo.hasta} s de los ${escena.segundos} s de la escena.`}
      </figcaption>
    </figure>
  );
}
