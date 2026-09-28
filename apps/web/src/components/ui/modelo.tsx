import { BadgeCheck, CircleDot, CircleSlash, FlaskConical, MicOff, Tag, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import {
  DESCRIPCION_CAPACIDAD,
  DESCRIPCION_ESTADO_MODELO,
  type EstadoModelo,
  ETIQUETA_CAPACIDAD,
  ETIQUETA_ESTADO_MODELO,
  type ModeloElegible,
  type ModeloVista,
  resumenParametros,
} from "@/lib/catalogo";
import { formatearCreditos } from "@/lib/generacion";
import { cn } from "./cn";
import type { Opcion } from "./options";
import { Selector } from "./select";

/**
 * Catálogo de modelos en la interfaz: insignia de estado, ficha legible y selector por capacidad. La ficha
 * es zona de claridad (superficie neutra, sin degradados ni movimiento): dice qué hace el modelo, qué
 * necesita, cuánto cuesta y cuándo se comprobó ese precio, sin adornos.
 */

const ASPECTO_ESTADO: Record<EstadoModelo, { icono: ReactNode; clase: string }> = {
  descubierto: { icono: <CircleDot />, clase: "text-texto-suave" },
  precio_publicado: { icono: <Tag />, clase: "text-acento" },
  compatible: { icono: <FlaskConical />, clase: "text-acento" },
  validado: { icono: <BadgeCheck />, clase: "text-correcto" },
  retirado: { icono: <CircleSlash />, clase: "text-error" },
};

export function InsigniaEstadoModelo({ estado }: { estado: EstadoModelo }) {
  const a = ASPECTO_ESTADO[estado];
  return (
    <span
      title={DESCRIPCION_ESTADO_MODELO[estado]}
      className={cn("inline-flex items-center gap-2 rounded-full bg-elevada px-3 py-1 text-sm font-semibold", a.clase)}
    >
      <span aria-hidden className="[&>svg]:size-4">
        {a.icono}
      </span>
      {ETIQUETA_ESTADO_MODELO[estado]}
    </span>
  );
}

/** Aviso de que el modelo no genera voz: su clip no puede decir nada. */
export function AvisoSinVoz() {
  return (
    <p className="flex items-start gap-2 rounded-control bg-elevada p-3 text-sm font-medium text-texto">
      <MicOff className="mt-0.5 size-4 shrink-0 text-aviso" aria-hidden />
      {/* Un solo hijo de texto: suelto dentro del flex, cada trozo sería una columna. */}
      <span>
        Este modelo genera vídeo <strong className="font-semibold">sin voz</strong>: el personaje no dirá nada, así que
        «Lo que dice» no se usa. Para que hable, elige un modelo con voz.
      </span>
    </p>
  );
}

/** Precio del modelo con su fuente y su fecha; avisa si se comprobó hace más de 90 días. */
export function PrecioDeModelo({ modelo }: { modelo: ModeloVista }) {
  if (!modelo.precio) {
    return <p className="text-sm font-medium text-texto">Sin precio registrado: no se puede estimar ni generar.</p>;
  }
  const { creditos, unidad, fuente, comprobado, caducado } = modelo.precio;
  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-lg font-semibold text-texto">
        {formatearCreditos(creditos)} <span className="font-sans text-sm font-normal text-texto-suave">/ {unidad}</span>
      </p>
      <p className="text-sm text-texto-suave">
        {fuente}, comprobado el {comprobado}.
      </p>
      {caducado && (
        <p className="flex items-center gap-2 text-sm font-medium text-texto">
          <TriangleAlert className="size-4 shrink-0 text-aviso" aria-hidden />
          Hace más de 90 días que no se comprueba: puede haber cambiado.
        </p>
      )}
    </div>
  );
}

/**
 * Ficha de un modelo: qué hace (capacidades), qué necesita (parámetros y formatos), cuánto cuesta y cuándo
 * se comprobó. `acciones` es el hueco donde el admin pone sus botones.
 */
export function FichaModelo({ modelo, acciones }: { modelo: ModeloVista; acciones?: ReactNode }) {
  const parametros = resumenParametros(modelo.parametros);
  return (
    <article className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-texto">{modelo.nombre}</h3>
          <p className="text-sm text-texto-suave">
            {modelo.nombreProveedor} · <span className="font-mono">{modelo.modelo}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {modelo.predeterminado && (
            <span className="rounded-full bg-elevada px-3 py-1 text-sm font-semibold text-texto">Por defecto</span>
          )}
          <InsigniaEstadoModelo estado={modelo.estado} />
        </div>
      </div>

      <ul className="flex flex-col gap-1">
        {modelo.capacidades.map((c) => (
          <li key={c} className="text-texto">
            <span className="font-semibold">{ETIQUETA_CAPACIDAD[c]}:</span>{" "}
            <span className="text-texto-suave">{DESCRIPCION_CAPACIDAD[c]}</span>
          </li>
        ))}
      </ul>

      {parametros.length > 0 && (
        <dl className="grid gap-2 sm:grid-cols-2">
          {parametros.map((texto) => {
            const [etiqueta, valor] = texto.split(": ");
            return (
              <div key={texto} className="rounded-control bg-elevada px-3 py-2">
                <dt className="text-sm text-texto-suave">{etiqueta}</dt>
                <dd className="text-base font-semibold text-texto">{valor}</dd>
              </div>
            );
          })}
        </dl>
      )}

      <PrecioDeModelo modelo={modelo} />

      {!modelo.conVoz && modelo.capacidades.some((c) => c === "image_to_video" || c === "text_to_video") && (
        <AvisoSinVoz />
      )}

      {modelo.notas && <p className="text-sm text-texto-suave">{modelo.notas}</p>}
      {modelo.evidencia && (
        <p className="text-sm text-texto-suave">
          <span className="font-semibold text-texto">Evidencia:</span> {modelo.evidencia}
        </p>
      )}
      <p className="text-sm text-texto-suave">Versión del registro: {modelo.version}</p>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </article>
  );
}

/** Opción de un modelo en el selector: nombre, y debajo su coste y su estado. */
export function opcionDeModelo(modelo: ModeloElegible): Opcion {
  const coste = formatearCreditos(modelo.creditos);
  const voz = modelo.conVoz ? "" : " · sin voz";
  return {
    value: modelo.modelo,
    label: modelo.nombre,
    descripcion: `${coste} por ${modelo.unidad} · ${ETIQUETA_ESTADO_MODELO[modelo.estado].toLowerCase()}${voz}`,
  };
}

/**
 * Selector de modelo por capacidad. Solo recibe modelos elegibles (`compatible` o `validado` y con
 * precio): un modelo retirado no llega ni a la lista.
 */
export function SelectorModelo({
  etiqueta,
  modelos,
  valor,
  onCambio,
  deshabilitado,
}: {
  etiqueta: string;
  modelos: ModeloElegible[];
  valor: string;
  onCambio: (modelo: string) => void;
  deshabilitado?: boolean;
}) {
  return (
    <Selector
      etiqueta={etiqueta}
      opciones={modelos.map(opcionDeModelo)}
      valor={valor}
      onCambio={(v) => v && onCambio(v)}
      deshabilitado={deshabilitado}
    />
  );
}
