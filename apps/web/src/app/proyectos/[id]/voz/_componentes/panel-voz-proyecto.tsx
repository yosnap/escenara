"use client";

import { Play } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { GrupoOpciones } from "@/components/ui/choice";
import { Aviso } from "@/components/ui/feedback";
import { Campo } from "@/components/ui/field";
import { Selector } from "@/components/ui/select";
import { formatearCreditos } from "@/lib/generacion";
import {
  DESCRIPCION_MODO_VOZ,
  ETIQUETA_MODO_VOZ,
  ETIQUETA_PARAMETRO_VOZ,
  LIMITES_PARAMETROS_VOZ,
  MODOS_VOZ,
  type ModoVoz,
  nombreDeVoz,
  PARAMETROS_VOZ_POR_DEFECTO,
  type ParametrosVoz,
  type VozProyectoVista,
} from "@/lib/voz";
import { PanelVozOmni } from "./panel-voz-omni";

/**
 * Modo y voz **del proyecto** (RF08, 0.21.0). La pantalla dice en todo momento lo mismo que el servidor: la voz vale
 * para todas las escenas y no se puede cambiar en una sola.
 *
 * La zona del coste es deliberadamente sobria: sin degradados ni movimiento, con la cifra en créditos y el aviso de
 * que es una estimación. Y cuando no hay precio registrado, **no se ofrece gastar**: se dice por qué.
 */
export function PanelVozProyecto({
  estado,
  ocupado,
  onModo,
  onVoz,
  onMuestra,
  onVozOmni,
}: {
  estado: VozProyectoVista;
  ocupado: boolean;
  onModo: (modo: ModoVoz, confirmar: boolean) => void;
  onVoz: (voz: string, parametros: ParametrosVoz, confirmar: boolean) => void;
  onMuestra: (voz: string, parametros: ParametrosVoz) => void;
  /** Registra la voz Omni del proyecto (0.22.0). No cuesta créditos. */
  onVozOmni: (voz: string, descripcion: string, ejemplo: string) => void;
}) {
  const vozFijada = estado.voz;
  const [voz, setVoz] = useState(vozFijada?.voz ?? estado.disponibilidad.voces[0]?.id ?? "");
  const [parametros, setParametros] = useState<ParametrosVoz>(vozFijada?.parametros ?? PARAMETROS_VOZ_POR_DEFECTO);
  const { disponibilidad: d } = estado;
  const muestra = estado.muestras[voz] ?? null;
  const cambiada = vozFijada === null || vozFijada.voz !== voz || !mismosParametros(vozFijada.parametros, parametros);

  return (
    <section
      aria-label="Voz del proyecto"
      className="flex flex-col gap-5 rounded-tarjeta border-2 border-borde bg-superficie p-5"
    >
      <GrupoOpciones
        etiqueta="De dónde sale la voz de este proyecto"
        valor={estado.modo}
        opciones={MODOS_VOZ.map((modo) => ({
          value: modo,
          etiqueta: ETIQUETA_MODO_VOZ[modo],
          descripcion: DESCRIPCION_MODO_VOZ[modo],
        }))}
        onCambio={(v) => onModo(v as ModoVoz, false)}
      />

      {estado.modo === "clip" ? (
        <Aviso tono="info">
          La voz la genera el modelo de vídeo dentro de cada clip, con los labios sincronizados. No hay ninguna voz que
          elegir y los subtítulos salen de transcribir el audio del clip, que no cuesta nada.
        </Aviso>
      ) : estado.modo === "omni" ? (
        // En Omni no hay pista TTS que configurar: la voz va dentro del personaje registrado.
        estado.omni && <PanelVozOmni omni={estado.omni} ocupado={ocupado} onRegistrarVoz={onVozOmni} />
      ) : !d.ttsDisponible ? (
        <Aviso tono="error">{d.motivoTts}</Aviso>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-texto-suave">
            Esta voz se usa en <strong className="text-texto">todas</strong> las escenas del proyecto y no se puede
            cambiar en una sola: si cada escena tuviera la suya, el timbre cambiaría de plano a plano.
          </p>
          <Selector
            etiqueta="Voz"
            valor={voz}
            onCambio={(v) => setVoz(v ?? voz)}
            opciones={d.voces.map((v) => ({ value: v.id, label: v.nombre, descripcion: v.descripcion }))}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {(Object.keys(LIMITES_PARAMETROS_VOZ) as (keyof ParametrosVoz)[]).map((clave) => {
              const { min, max, paso } = LIMITES_PARAMETROS_VOZ[clave];
              return (
                <Campo
                  key={clave}
                  etiqueta={`${ETIQUETA_PARAMETRO_VOZ[clave]}: ${parametros[clave]}`}
                  ayuda={`De ${min} a ${max}. Queda fijo para todo el proyecto.`}
                >
                  {(p) => (
                    <input
                      {...p}
                      type="range"
                      min={min}
                      max={max}
                      step={paso}
                      value={parametros[clave]}
                      onChange={(e) => setParametros({ ...parametros, [clave]: Number(e.target.value) })}
                      className="h-11 w-full accent-acento"
                    />
                  )}
                </Campo>
              );
            })}
          </div>

          {/* Muestra: una por voz y por parámetros. Si ya está pagada, se dice que no cuesta nada. */}
          <div className="flex flex-col gap-2 rounded-tarjeta border-2 border-borde bg-elevada p-4">
            <p className="text-sm font-semibold text-texto">Oír esta voz</p>
            {muestra ? (
              <>
                <p className="text-sm text-texto-suave">Ya has pagado esta muestra: volver a oírla no cuesta nada.</p>
                {/* biome-ignore lint/a11y/useMediaCaption: es una muestra de voz de una sola frase, sin contenido que subtitular */}
                <audio controls src={muestra.url} className="w-full" />
              </>
            ) : (
              <>
                <p className="text-sm text-texto-suave">
                  {d.creditosPorEscena === null
                    ? "No hay precio registrado para el modelo de voz, así que no se puede estimar lo que costaría oírla."
                    : `Generar la muestra cuesta ${formatearCreditos(d.creditosPorEscena)} estimados, una sola vez por voz y por estos parámetros. Después se guarda y volver a oírla no cuesta nada.`}
                </p>
                {/* Con quién se va a pagar, y a quién se cambiaría solo. Quien paga tiene que saberlo antes. */}
                {d.nombreProveedor !== "" && (
                  <p className="text-sm text-texto-suave">
                    Se genera con <strong className="text-texto">{d.nombreProveedor}</strong>, con tu clave suya.
                    {d.reserva
                      ? ` Si rechazara la petición sin cobrar, se probaría solo con ${d.reserva.nombre} y se te diría. Cada escena muestra lo que costaría en cada uno, en la moneda de cada proveedor: los créditos de uno no valen lo mismo que los del otro.`
                      : ""}
                  </p>
                )}
                <Boton
                  variante="secundario"
                  tamano="sm"
                  icono={<Play />}
                  disabled={ocupado || d.creditosPorEscena === null}
                  onClick={() => onMuestra(voz, parametros)}
                >
                  Oír una muestra
                </Boton>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Boton disabled={ocupado || !cambiada} onClick={() => onVoz(voz, parametros, false)}>
              {vozFijada === null ? "Fijar esta voz en el proyecto" : "Cambiar la voz del proyecto"}
            </Boton>
            {vozFijada !== null && (
              <p className="text-sm text-texto-suave">
                Ahora suena con <strong className="text-texto">{nombreDeVoz(vozFijada.voz)}</strong>, fijada el{" "}
                {new Date(vozFijada.fijadaEn).toLocaleDateString("es-ES")}.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

const mismosParametros = (a: ParametrosVoz, b: ParametrosVoz) =>
  (Object.keys(LIMITES_PARAMETROS_VOZ) as (keyof ParametrosVoz)[]).every((k) => a[k] === b[k]);
