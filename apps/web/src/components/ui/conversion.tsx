import { FolderKanban, Mic, Scissors, VolumeX } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import {
  type ClipProducidoVista,
  comoPonerVozEnOff,
  comoSuenaLaEscena,
  SIN_SUBTITULOS_AUDIO_QUITADO,
  subtitulosSinAudio,
} from "@/lib/audio-del-clip";
import { type EstadoConversion, EXPLICACION_CONVERTIR } from "@/lib/conversion";
import type { ModoVoz } from "@/lib/voz";
import { Boton, claseBoton } from "./button";
import { Interruptor } from "./choice";
import { Aviso } from "./feedback";
import { PrevisualizacionVertical } from "./montaje/previsualizacion-vertical";

/**
 * **De «Crear» a un proyecto** (0.35.0): el botón que convierte un clip terminado en un proyecto de una escena, y
 * la tarjeta del clip ya producido en el proyecto con sus dos acciones de audio.
 *
 * Solo pintan: quién pide, quién guarda y quién decide si se puede está fuera (`app/crear` y `app/proyectos`), así
 * que el catálogo los enseña en todos sus estados sin tocar ningún servidor.
 */

/**
 * Botón «Convertir en proyecto» con su explicación. **Nunca se oculta**: si el clip no se puede convertir, sale
 * deshabilitado y dice por qué; si ya se convirtió, lleva a su proyecto en vez de crear otro.
 */
export function TarjetaConvertirEnProyecto({
  estado,
  cargando,
  convirtiendo,
  error,
  onConvertir,
}: {
  /** `null` mientras se pregunta al servidor. */
  estado: EstadoConversion | null;
  cargando?: boolean;
  convirtiendo?: boolean;
  error?: string | null;
  onConvertir?: () => void;
}) {
  const idMotivo = useId();
  return (
    <div className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-elevada p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-degradado-foco text-white"
        >
          <FolderKanban className="size-4" />
        </span>
        <div className="flex flex-col gap-1">
          <h4 className="font-bold text-texto">Seguir con este clip en un proyecto</h4>
          <p className="text-sm text-texto-suave">{EXPLICACION_CONVERTIR}</p>
        </div>
      </div>

      {estado?.estado === "convertido" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link href={estado.url} className={claseBoton("primario", "md")}>
            <FolderKanban className="size-5" aria-hidden /> Abrir su proyecto
          </Link>
          <span className="text-sm text-texto-suave">
            Este clip ya es la escena del proyecto «{estado.titulo}»: no se crea otro.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div>
            <Boton
              variante="chispa"
              icono={<FolderKanban className="size-5" aria-hidden />}
              cargando={convirtiendo}
              disabled={cargando || estado === null || estado.estado !== "convertible"}
              // Desactivado, el botón no recibe el foco: el motivo se asocia para que el lector de pantalla lo lea.
              aria-describedby={estado?.estado === "convertible" ? undefined : idMotivo}
              onClick={onConvertir}
            >
              Convertir en proyecto
            </Boton>
          </div>
          <div id={idMotivo}>
            {estado === null && (
              <p className="text-sm text-texto-suave">Comprobando si este clip se puede convertir…</p>
            )}
            {estado?.estado === "no_convertible" && <Aviso tono="info">{estado.motivo}</Aviso>}
          </div>
          {estado?.estado === "convertible" &&
            estado.avisos.map((aviso) => (
              <Aviso key={aviso} tono="info">
                {aviso}
              </Aviso>
            ))}
        </div>
      )}
      {error && <Aviso tono="error">{error}</Aviso>}
    </div>
  );
}

/**
 * El clip ya producido de una escena, con lo que se va a oír y las dos acciones de audio: **quitar su audio
 * propio** (un interruptor que no cuesta nada) y **ponerle voz en off** (la pista de voz aparte, en «Voz y
 * subtítulos», con su coste confirmado). Lleva también al montaje.
 */
export function TarjetaClipProducido({
  clip,
  modoVoz,
  proyectoId,
  ocupado,
  onQuitarAudio,
}: {
  clip: ClipProducidoVista;
  modoVoz: ModoVoz;
  proyectoId: string;
  ocupado?: boolean;
  onQuitarAudio?: (quitado: boolean) => void;
}) {
  const vozEnOff = comoPonerVozEnOff(clip, modoVoz);
  return (
    <div className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-4 sm:flex-row">
      <PrevisualizacionVertical
        className="w-full shrink-0 sm:w-40"
        src={clip.medio.url || undefined}
        vacio="El clip de esta escena está en tu biblioteca."
        pie="Clip ya producido: no se vuelve a generar."
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <h4 className="font-bold text-texto">Escena {clip.orden} · clip producido</h4>
        <p className="text-sm text-texto-suave">{comoSuenaLaEscena(clip, modoVoz)}</p>
        <Interruptor
          etiqueta="Quitar el audio del clip"
          descripcion="En el montaje y en el MP4 esta escena entra sin el sonido que trae el clip. No toca el archivo y no cuesta nada."
          activo={clip.audioQuitado}
          deshabilitado={ocupado}
          onCambio={(quitado) => onQuitarAudio?.(quitado)}
        />
        {subtitulosSinAudio(clip, modoVoz) && (
          <p className="text-sm text-texto-suave">{SIN_SUBTITULOS_AUDIO_QUITADO}</p>
        )}
        {vozEnOff && <p className="text-sm text-texto">{vozEnOff}</p>}
        <div className="flex flex-wrap gap-2">
          <Link href={`/proyectos/${proyectoId}/voz`} className={claseBoton("secundario", "sm")}>
            <Mic className="size-4" aria-hidden /> Voz y subtítulos
          </Link>
          <Link href={`/proyectos/${proyectoId}/montaje`} className={claseBoton("secundario", "sm")}>
            <Scissors className="size-4" aria-hidden /> Montaje y exportación
          </Link>
          {clip.audioQuitado && (
            <span className="inline-flex items-center gap-1 self-center text-xs text-texto-suave">
              <VolumeX className="size-3.5" aria-hidden /> Sin el audio del clip
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
