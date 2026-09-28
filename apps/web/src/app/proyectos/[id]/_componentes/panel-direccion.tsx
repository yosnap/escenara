"use client";

import { Clapperboard } from "lucide-react";
import { Aviso } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { Selector } from "@/components/ui/select";
import {
  AVISO_MOVIMIENTO_AVANZADO,
  DESCRIPCION_FORMATO_CLIP,
  DESCRIPCION_REGISTRO_ESTETICO,
  FORMATOS_CLIP,
  formatoHabla,
  MOMENTOS_MICROACCION,
  NOMBRE_FORMATO_CLIP,
  NOMBRE_MOMENTO_MICROACCION,
  NOMBRE_NIVEL_CAMARA,
  NOMBRE_REGISTRO_ESTETICO,
  type OpcionDireccion,
  type OpcionesDeDireccion,
  REGISTROS_ESTETICOS,
} from "@/lib/direccion";
import { DIRECCION_VOCAL_MAXIMA, type DireccionDeEscenaVista } from "@/lib/proyectos";

/**
 * **Panel de dirección de una escena** (0.25.0): las seis partes que el usuario elige para dirigir su clip.
 *
 * Tres reglas que se ven en la pantalla:
 *
 * - **no se enseña el prompt**, ni entero ni a trozos (ADR-0022). Lo que se enseña es el resumen en castellano
 *   de lo que ha pedido, que es lo que puede reconocer en el clip;
 * - **la toma única no es una opción**: se dice que va siempre, y no hay forma de quitarla;
 * - **no elegir también es elegir**: sin movimiento, la cámara se queda quieta, y así se le pide al modelo.
 *
 * Todos los desplegables son el `Selector` del catálogo: aquí no hay ningún `<select>` nativo.
 */

/** Opción vacía: el catálogo no obliga a elegir, y «sin elegir» tiene un significado distinto en cada campo. */
const SIN_ELEGIR = "";

const opcionesDe = (lista: OpcionDireccion[], vacio: string) => [
  { value: SIN_ELEGIR, label: vacio },
  ...lista.map((o) => ({ value: o.clave, label: o.nombre, descripcion: o.descripcion })),
];

export function PanelDireccion({
  direccion,
  opciones,
  deshabilitado,
  onCambio,
}: {
  direccion: DireccionDeEscenaVista;
  opciones: OpcionesDeDireccion | null;
  deshabilitado?: boolean;
  /** Cambia un campo. El guardado lo decide quien usa el panel, con el resto de la escena. */
  onCambio: <C extends keyof DireccionDeEscenaVista>(campo: C, valor: DireccionDeEscenaVista[C]) => void;
}) {
  if (!opciones) return null;
  const habla = formatoHabla(direccion.formatoClip);
  const camaraElegida = opciones.camara.find((o) => o.clave === direccion.camara);
  const gestoElegido = opciones.microaccion.find((o) => o.clave === direccion.microaccion);

  /** Lo que ha pedido, escrito en castellano. No es el prompt: es su elección. */
  const nombreDe = (lista: OpcionDireccion[], clave: string) => lista.find((o) => o.clave === clave)?.nombre ?? "";
  const resumen = [
    NOMBRE_FORMATO_CLIP[direccion.formatoClip],
    nombreDe(opciones.plano, direccion.plano),
    nombreDe(opciones.angulo, direccion.angulo),
    camaraElegida?.nombre ?? "cámara quieta",
    gestoElegido
      ? `${gestoElegido.nombre} (${NOMBRE_MOMENTO_MICROACCION[direccion.momentoMicroaccion].toLowerCase()})`
      : "",
    habla ? "" : "sin voz",
  ].filter((parte) => parte !== "");

  return (
    <section className="flex flex-col gap-4 rounded-tarjeta border border-borde bg-elevada/40 p-4">
      <h4 className="flex items-center gap-2 font-semibold text-texto">
        <Clapperboard className="size-5 text-acento" />
        Dirección del clip
      </h4>

      <Selector
        etiqueta="Formato"
        valor={direccion.formatoClip}
        deshabilitado={deshabilitado}
        opciones={FORMATOS_CLIP.map((f) => ({
          value: f,
          label: NOMBRE_FORMATO_CLIP[f],
          descripcion: DESCRIPCION_FORMATO_CLIP[f],
        }))}
        onCambio={(v) => v && onCambio("formatoClip", v as DireccionDeEscenaVista["formatoClip"])}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Selector
          etiqueta="Plano"
          valor={direccion.plano}
          deshabilitado={deshabilitado}
          opciones={opcionesDe(opciones.plano, "Sin elegir")}
          onCambio={(v) => onCambio("plano", v ?? SIN_ELEGIR)}
        />
        <Selector
          etiqueta="Ángulo"
          valor={direccion.angulo}
          deshabilitado={deshabilitado}
          opciones={opcionesDe(opciones.angulo, "Sin elegir")}
          onCambio={(v) => onCambio("angulo", v ?? SIN_ELEGIR)}
        />
      </div>

      <Selector
        etiqueta="Movimiento de cámara"
        valor={direccion.camara}
        deshabilitado={deshabilitado}
        opciones={opcionesDe(opciones.camara, "Cámara quieta")}
        onCambio={(v) => onCambio("camara", v ?? SIN_ELEGIR)}
      />
      {camaraElegida?.nivel && camaraElegida.nivel !== "basico" && (
        <p className="text-sm text-texto-suave">
          Nivel: <strong className="font-semibold">{NOMBRE_NIVEL_CAMARA[camaraElegida.nivel]}</strong>.{" "}
          {camaraElegida.nivel === "avanzado" ? AVISO_MOVIMIENTO_AVANZADO : "Sale bien la mayoría de las veces."}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Selector
          etiqueta="Micro-acción"
          valor={direccion.microaccion}
          deshabilitado={deshabilitado}
          opciones={opcionesDe(opciones.microaccion, "Ninguna")}
          onCambio={(v) => {
            const clave = v ?? SIN_ELEGIR;
            onCambio("microaccion", clave);
            // Al elegir un gesto se propone el momento que trae el catálogo; el usuario puede cambiarlo.
            const propuesto = opciones.microaccion.find((o) => o.clave === clave)?.momento;
            if (propuesto) onCambio("momentoMicroaccion", propuesto);
          }}
        />
        <Selector
          etiqueta="Cuándo"
          valor={direccion.momentoMicroaccion}
          deshabilitado={deshabilitado || direccion.microaccion === SIN_ELEGIR}
          opciones={MOMENTOS_MICROACCION.map((m) => ({ value: m, label: NOMBRE_MOMENTO_MICROACCION[m] }))}
          onCambio={(v) => v && onCambio("momentoMicroaccion", v as DireccionDeEscenaVista["momentoMicroaccion"])}
        />
      </div>

      {habla && (
        <Campo
          etiqueta="Cómo lo dice"
          ayuda="Un matiz corto de la voz: «en tono cercano», «con energía». El guion no se toca."
        >
          {(props) => (
            <EntradaTexto
              {...props}
              value={direccion.direccionVocal}
              maxLength={DIRECCION_VOCAL_MAXIMA}
              disabled={deshabilitado}
              onChange={(e) => onCambio("direccionVocal", e.target.value)}
            />
          )}
        </Campo>
      )}

      <h4 className="mt-2 font-semibold text-texto">El fotograma</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <Selector
          etiqueta="Óptica"
          valor={direccion.optica}
          deshabilitado={deshabilitado}
          opciones={opcionesDe(opciones.optica, "Sin elegir")}
          onCambio={(v) => onCambio("optica", v ?? SIN_ELEGIR)}
        />
        <Selector
          etiqueta="Luz"
          valor={direccion.luz}
          deshabilitado={deshabilitado}
          opciones={opcionesDe(opciones.luz, "Sin elegir")}
          onCambio={(v) => onCambio("luz", v ?? SIN_ELEGIR)}
        />
        <Selector
          etiqueta="Sitio"
          valor={direccion.localizacion}
          deshabilitado={deshabilitado}
          opciones={opcionesDe(opciones.localizacion, "Sin elegir")}
          onCambio={(v) => onCambio("localizacion", v ?? SIN_ELEGIR)}
        />
        <Selector
          etiqueta="Registro estético"
          valor={direccion.registroEstetico}
          deshabilitado={deshabilitado}
          opciones={REGISTROS_ESTETICOS.map((r) => ({
            value: r,
            label: NOMBRE_REGISTRO_ESTETICO[r],
            descripcion: DESCRIPCION_REGISTRO_ESTETICO[r],
          }))}
          onCambio={(v) => v && onCambio("registroEstetico", v as DireccionDeEscenaVista["registroEstetico"])}
        />
      </div>

      {/* Lo que ha pedido, en castellano. Nunca el prompt: eso solo lo ve quien administra. */}
      <Aviso tono="info">
        Le pedirás: <strong className="font-semibold">{resumen.join(" · ")}</strong>. Siempre en{" "}
        <strong className="font-semibold">una sola toma, sin cortes</strong>, elijas lo que elijas.
        {!habla && " El guion no se le envía al modelo: el personaje sale con la boca cerrada."}
      </Aviso>
    </section>
  );
}
