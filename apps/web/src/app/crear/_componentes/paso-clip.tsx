"use client";

import { Clapperboard, Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import { Boton } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
import { PanelDireccion } from "@/components/ui/direccion/panel-direccion";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo } from "@/components/ui/field";
import { AvisoSinVoz, SelectorDuracion, SelectorModelo } from "@/components/ui/modelo";
import { Paso } from "@/components/ui/paso";
import type { ModeloElegible } from "@/lib/catalogo";
import type { DireccionElegidaConAcento, OpcionesDeDireccion } from "@/lib/direccion";
import { DIALOGO_MAXIMO, type Estimacion, type TrabajoVista } from "@/lib/generacion";
import type { Medio } from "@/lib/media/tipos";
import { AVISO_SIN_TERCEROS } from "@/lib/personajes";
import type { CatalogoParaCrear, PresetVisible } from "@/lib/presets";
import type { ProductoElegido } from "@/lib/productos";
import { BloqueConfirmacion } from "./bloque-confirmacion";
import type { ConfirmacionCoste } from "./panel-generar";
import { type EstadoPlantilla, PanelPlantilla, type Previsualizacion } from "./panel-plantilla";
import { ResultadoTrabajo } from "./resultado-trabajo";
import { SeguimientoTrabajo } from "./seguimiento-trabajo";
import type { Controles } from "./use-controles";

/**
 * **El paso del clip de «Crear»** (0.25.1).
 *
 * Qué cambia respecto a la 0.25.0, y por qué:
 *
 * - **se dirige el clip aquí**, con el mismo panel que la escena de un proyecto. Antes la dirección solo existía
 *   dentro de un proyecto, así que en «Crear» el encuadre y la cámara los decidía el modelo;
 * - **el fotograma de partida puede ser una imagen tuya**: un fotograma de otro día, una vista del personaje o
 *   una foto que subiste. Generar uno nuevo cuesta dinero, y muchas veces no hace falta;
 * - **se puede pedir otro clip con el mismo fotograma**, cambiando la dirección o el texto. El anterior no se
 *   toca: sigue en tu biblioteca.
 *
 * Está en su propio fichero para que `vista-crear.tsx` siga leyéndose de una vez. Aquí no hay estado propio:
 * todo lo que se elige sube a quien lo guarda, que es quien también sabe pedir estimaciones.
 */
export function PasoClip({
  numero,
  origen,
  modelos,
  estimacion,
  conVoz,
  segundos,
  dialogo,
  opcionesDireccion,
  direccion,
  producto,
  onProducto,
  catalogo,
  plantilla,
  previa,
  previaMotivos,
  controles,
  exigeRevision,
  sinTerceros,
  enviando,
  firma,
  clipEnMarcha,
  clipsAnteriores,
  accionesDePreset,
  onModelo,
  onDuracion,
  onDialogo,
  onDireccion,
  onPlantilla,
  onDuplicar,
  onSinTerceros,
  onGenerar,
  onCambioClip,
  onOtroClip,
}: {
  numero: number;
  /** La imagen que será el primer fotograma, venga de donde venga. `null` mientras no haya ninguna. */
  origen: Medio | null;
  modelos: ModeloElegible[];
  estimacion: Estimacion;
  conVoz: boolean;
  segundos: number;
  dialogo: string;
  opcionesDireccion: OpcionesDeDireccion | null;
  direccion: DireccionElegidaConAcento;
  /** El producto del clip y qué se hace con él. Se elige en el mismo panel que la dirección. */
  producto: ProductoElegido;
  onProducto: (elegido: ProductoElegido) => void;
  catalogo: CatalogoParaCrear;
  plantilla: EstadoPlantilla;
  previa: Previsualizacion;
  previaMotivos: string[];
  controles: Controles;
  /** `true` cuando el fotograma de partida lleva la cara de un personaje: hay que confirmar la revisión. */
  exigeRevision: boolean;
  sinTerceros: boolean;
  enviando: boolean;
  firma: string;
  /** Clip que está en la cola o en el proveedor ahora mismo. */
  clipEnMarcha: TrabajoVista | null;
  /** Clips ya terminados de este mismo fotograma, del más reciente al más antiguo. */
  clipsAnteriores: TrabajoVista[];
  accionesDePreset: (preset: PresetVisible) => ReactNode;
  onModelo: (modelo: string) => void;
  onDuracion: (segundos: number) => void;
  onDialogo: (texto: string) => void;
  onDireccion: <C extends keyof DireccionElegidaConAcento>(campo: C, valor: DireccionElegidaConAcento[C]) => void;
  onPlantilla: (estado: EstadoPlantilla) => void;
  onDuplicar: (preset: PresetVisible) => void;
  onSinTerceros: (valor: boolean) => void;
  onGenerar: (confirmacion: ConfirmacionCoste) => void;
  onCambioClip: (trabajo: TrabajoVista) => void;
  /**
   * Pide otro clip del mismo fotograma. Con `precargar`, la dirección vuelve a abrirse **tal como se usó** en el
   * clip que se está mirando: es «cambiar y volver a generar», no empezar de cero.
   */
  onOtroClip: (precargar: TrabajoVista | null) => void;
}) {
  const hayOrigen = origen !== null;
  return (
    <Paso numero={numero} titulo="El clip">
      {!hayOrigen ? (
        <p className="rounded-control bg-elevada p-3 text-sm font-medium text-texto">
          Elige arriba la imagen de la que sale el clip: la que generes o la que traigas de tu biblioteca.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {modelos.length > 1 && (
            <SelectorModelo
              etiqueta="Modelo del clip"
              modelos={modelos}
              valor={estimacion.modelo}
              onCambio={onModelo}
              deshabilitado={enviando}
            />
          )}
          {/* La duración sale del modelo y de lo que sabe cobrar, no de un texto escrito a mano. */}
          <SelectorDuracion
            duraciones={estimacion.duraciones}
            valor={segundos}
            deshabilitado={enviando}
            onCambio={onDuracion}
          />
          {conVoz ? (
            <Campo
              etiqueta="Lo que dice"
              ayuda={
                <>
                  Es lo que se le oirá decir, tal cual.{" "}
                  <span className="font-mono">
                    {dialogo.length}/{DIALOGO_MAXIMO}
                  </span>
                </>
              }
            >
              {(props) => (
                <AreaTexto
                  {...props}
                  value={dialogo}
                  maxLength={DIALOGO_MAXIMO}
                  disabled={enviando}
                  className="min-h-20"
                  onChange={(e) => onDialogo(e.target.value)}
                  placeholder="¡Estamos muy contentos de lanzar esto!"
                />
              )}
            </Campo>
          ) : (
            <AvisoSinVoz />
          )}

          <PanelDireccion
            direccion={direccion}
            opciones={opcionesDireccion}
            guion={dialogo}
            segundos={segundos}
            conAcento
            // En «Crear» el fotograma no se dirige aquí: o es una imagen tuya (no se genera) o tiene su propio paso.
            conFotograma={false}
            producto={producto}
            onProducto={onProducto}
            deshabilitado={enviando}
            onCambio={onDireccion}
          />

          {exigeRevision && (
            <Casilla
              etiqueta="En estas fotos no aparece ninguna otra persona ni ningún menor"
              descripcion={AVISO_SIN_TERCEROS}
              marcada={sinTerceros}
              deshabilitado={enviando}
              onCambio={onSinTerceros}
            />
          )}

          <PanelPlantilla
            catalogo={catalogo}
            estado={plantilla}
            previa={previa}
            deshabilitado={enviando}
            onCambio={onPlantilla}
            onDuplicar={onDuplicar}
            accionesDePreset={accionesDePreset}
          />

          {!clipEnMarcha && (
            <BloqueConfirmacion
              controles={controles}
              estimacion={estimacion}
              etiqueta={`Animar ${segundos} s`}
              firma={firma}
              bloqueos={[
                ...previaMotivos,
                ...(exigeRevision && !sinTerceros ? ["Falta confirmar la revisión de las fotos del personaje."] : []),
              ]}
              conProducto={producto.productoId !== ""}
              enviando={enviando}
              onGenerar={onGenerar}
            />
          )}
        </div>
      )}

      {clipEnMarcha && (
        <div className="flex flex-col gap-4">
          <SeguimientoTrabajo key={clipEnMarcha.id} inicial={clipEnMarcha} onCambio={onCambioClip} />
          {clipEnMarcha.medio && (
            <ResultadoTrabajo trabajo={clipEnMarcha}>
              <div className="flex flex-wrap gap-3">
                {/*
                  Los dos caminos para volver a generar. Ninguno borra nada: el clip que estás viendo sigue en tu
                  biblioteca, y el nuevo se confirma y se paga como cualquier otro.
                */}
                <Boton variante="secundario" onClick={() => onOtroClip(clipEnMarcha)}>
                  <Wand2 className="size-5" aria-hidden />
                  Cambiar y volver a generar
                </Boton>
                <Boton variante="secundario" onClick={() => onOtroClip(null)}>
                  <Clapperboard className="size-5" aria-hidden />
                  Otro clip con este fotograma
                </Boton>
              </div>
            </ResultadoTrabajo>
          )}
        </div>
      )}

      {clipsAnteriores.length > 0 && (
        <div className="flex flex-col gap-3">
          <h4 className="font-semibold text-texto">Clips anteriores de este fotograma</h4>
          <Aviso tono="info">Se conservan todos: están en tu biblioteca y ninguno se sustituye al generar otro.</Aviso>
          {clipsAnteriores.map((clip) => (
            <ResultadoTrabajo key={clip.id} trabajo={clip} />
          ))}
        </div>
      )}
    </Paso>
  );
}
