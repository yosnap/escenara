"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Boton, BotonIcono } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
import { type ElementoOrdenable, ListaOrdenable } from "@/components/ui/lista-ordenable";
import { MiniaturaMedio } from "@/components/ui/media/miniatura-medio";
import { SelectorMedios } from "@/components/ui/media/selector-medios";
import { DistintivoOrigen } from "@/components/ui/personajes/distintivo-origen";
import { EstadoIdentidad } from "@/components/ui/personajes/estado-identidad";
import { FotosRechazadas } from "@/components/ui/personajes/fotos-rechazadas";
import { Selector } from "@/components/ui/select";
import {
  ACCION_MOTIVO,
  ETIQUETA_MOTIVO,
  ETIQUETA_VISTA,
  esVista,
  type RechazoDeReferencia,
  type Vista,
  vistasMinimas,
} from "@/lib/captura-personaje";
import type { Medio } from "@/lib/media/tipos";
import { MAXIMO_REFERENCIAS, type PersonajeVista, type ReferenciaVista } from "@/lib/personajes";

/** Ancla de la sección: el panel de cobertura lleva aquí cuando hay fotos que clasificar. */
export const ANCLA_REFERENCIAS = "fotos-de-referencia";

/** `id` de la tarjeta de una foto en la página: es a donde llevan las miniaturas del panel de cobertura. */
export const idDeReferencia = (referenciaId: string) => `referencia-${referenciaId}`;

/** Valor del selector que deja la foto sin clasificar. No es una vista: es la ausencia de vista. */
const SIN_CLASIFICAR = "sin_clasificar";

/** Lo que devuelve añadir fotos: el error si lo hubo y las que se han quedado fuera, con su detalle. */
export interface ResultadoAnadir {
  error: string | null;
  rechazos: RechazoDeReferencia[];
}

/**
 * Fotos de referencia del personaje: añadir desde la biblioteca o subiendo, quitar y **ordenar arrastrando**. La
 * primera es la portada y la primera que se le envía al proveedor, así que el orden importa y se puede cambiar
 * con el ratón, con el dedo y con el teclado (lo gobierna `ListaOrdenable`).
 *
 * Quitar una referencia **no borra la foto de la biblioteca**: se deshace la relación y se dice expresamente.
 *
 * Cada foto lleva además el selector de **su vista**: las que se suben desde la biblioteca entran sin vista, y
 * sin poder decirla después no cubrirían nunca la cobertura ni se podrían volver a añadir por la captura guiada
 * (saltaría el duplicado). Las vistas generadas no lo llevan: su vista es la que pidió su trabajo.
 *
 * Y si el control de calidad deja alguna foto fuera, no se queda en un error sin salida: se enseña cuál, qué le
 * pasa y —salvo en los mínimos técnicos— se puede **usar de todas formas**.
 */
export function PanelReferencias({
  personaje,
  onCambio,
  onAnadir,
  onVista,
  onIdentidad,
  ocupado,
}: {
  personaje: PersonajeVista;
  /** Quitar o reordenar. Devuelve el error, o `null` si ha ido bien. */
  onCambio: (accion: "quitar" | "ordenar", ids: string[]) => Promise<string | null>;
  /** Añade fotos; `deTodasFormas` son las que se aceptan aunque estén marcadas. */
  onAnadir: (medioIds: string[], deTodasFormas?: string[]) => Promise<ResultadoAnadir>;
  /** Asigna la vista de una foto que ya está en el personaje; `null` la deja sin clasificar. */
  onVista: (referenciaId: string, vista: Vista | null) => void;
  /** Comprueba el parecido de una vista generada (0.24.0). Devuelve el motivo si no se ha podido comprobar. */
  onIdentidad: (referenciaId: string) => void;
  ocupado: boolean;
}) {
  const [nuevas, setNuevas] = useState<Medio[]>([]);
  /** Declaración de que lo que se añade a un inventado está generado con IA. Se pide en cada tanda. */
  const [declaradasIA, setDeclaradasIA] = useState(false);
  /** Fotos de la última tanda que se intentó añadir: son las que ponen cara a cada rechazo. */
  const [tanda, setTanda] = useState<Medio[]>([]);
  const [rechazadas, setRechazadas] = useState<RechazoDeReferencia[]>([]);
  const referencias = personaje.referencias ?? [];
  const hueco = MAXIMO_REFERENCIAS - referencias.length;
  // La portada la elige el servidor: es la **primera foto original**, no la primera referencia. Si la primera
  // fuera una vista generada, marcar la posición 0 diría que la portada es algo que no lo es.
  const portada = referencias.find((r) => r.origen === "foto_original")?.id ?? null;

  /**
   * Manda la tanda al servidor. `deTodasFormas` reenvía las fotos marcadas que el usuario acepta usar; como el
   * servidor ignora las que ya son referencia, reenviar la tanda entera solo añade las que faltaban.
   */
  const anadir = async (deTodasFormas: string[] = []) => {
    const fotos = nuevas.length > 0 ? nuevas.slice(0, hueco) : tanda;
    if (fotos.length === 0) return;
    setTanda(fotos);
    const { error, rechazos } = await onAnadir(
      fotos.map((m) => m.id),
      deTodasFormas,
    );
    setRechazadas(rechazos);
    // La selección se limpia también cuando hay rechazos: de ellos se encarga el panel de abajo, con su
    // miniatura y su acción, y dejarla puesta enseñaría las mismas fotos dos veces.
    if (!error || rechazos.length > 0) setNuevas([]);
  };

  const elementos: ElementoOrdenable[] = referencias.map((referencia) => ({
    clave: referencia.id,
    id: idDeReferencia(referencia.id),
    etiqueta: referencia.medio.nombre,
    contenido: (
      <>
        <div className="relative aspect-square overflow-hidden rounded-control bg-elevada">
          <MiniaturaMedio medio={referencia.medio} className="object-cover" />
          {referencia.id === portada && (
            <span className="absolute top-1.5 left-1.5 rounded-full bg-acento px-2 py-0.5 text-xs font-bold text-sobre-acento">
              Portada
            </span>
          )}
          {/* Una vista generada lleva su distintivo **sobre la propia imagen**: nunca se presenta como
              una foto del personaje, ni de refilón. */}
          {referencia.origen === "vista_generada" && (
            <DistintivoOrigen
              origen={referencia.origen}
              sobreImagen
              className="absolute inset-x-1.5 bottom-1.5 justify-center"
            />
          )}
        </div>
        {/* La vista de una imagen generada solo se elige cuando **no la trae**: eso pasa al añadir desde la
            biblioteca el resultado de un trabajo que no era «generar una vista». Si la trae, es la que pidió su
            trabajo y no se cambia. Clasificarla no la convierte en una foto tuya: sigue sin contar. */}
        {referencia.origen === "vista_generada" && referencia.vistaClave ? (
          <>
            <p className="text-xs text-texto-suave">{ETIQUETA_VISTA[referencia.vistaClave]}</p>
            <p className="text-xs text-texto-suave">
              Su vista ya no se cambia. Si no es la que querías, quítala y vuelve a añadirla.
            </p>
          </>
        ) : (
          <SelectorDeVista
            referencia={referencia}
            tipo={personaje.tipo}
            deshabilitado={ocupado}
            onVista={(vista) => onVista(referencia.id, vista)}
          />
        )}
        {referencia.origen === "vista_generada" && !personaje.inventado && (
          <p className="text-xs text-texto-suave">No cuenta como foto original del personaje.</p>
        )}
        {/* El parecido solo se comprueba en lo generado: una foto tuya **es** la referencia, no se compara. */}
        {referencia.origen === "vista_generada" && (
          <EstadoIdentidad
            identidad={referencia.identidad}
            motivo={referencia.identidadMotivo}
            inventado={personaje.inventado}
            ocupado={ocupado}
            onComprobar={() => onIdentidad(referencia.id)}
          />
        )}
        {referencia.motivosMarcada.map((motivo) => (
          <p key={motivo} className="text-xs font-medium text-aviso">
            {ETIQUETA_MOTIVO[motivo]}: {ACCION_MOTIVO[motivo]}
          </p>
        ))}
        <BotonIcono
          etiqueta={`Quitar ${referencia.medio.nombre} del personaje`}
          disabled={ocupado}
          className="size-9 self-end text-error"
          onClick={() => void onCambio("quitar", [referencia.id])}
        >
          <Trash2 className="size-4" />
        </BotonIcono>
      </>
    ),
  }));

  return (
    <section id={ANCLA_REFERENCIAS} aria-label="Fotos de referencia" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-bold text-texto">
          {personaje.inventado ? "Imágenes de referencia" : "Fotos de referencia"}
        </h2>
        <p className="text-sm text-texto-suave">
          {referencias.length} de {MAXIMO_REFERENCIAS} · {personaje.totalReferencias}{" "}
          {personaje.inventado
            ? personaje.totalReferencias === 1
              ? "imagen"
              : "imágenes"
            : personaje.totalReferencias === 1
              ? "original"
              : "originales"}{" "}
          de {personaje.minimoReferencias} para poder generar
        </p>
      </div>

      {referencias.length > 0 && (
        <>
          <p className="text-sm text-texto-suave">
            La primera es la <strong className="font-semibold text-texto">portada</strong> y la primera que se le envía
            al proveedor al generar: el orden cambia lo que ve el modelo.
          </p>
          <ListaOrdenable
            elementos={elementos}
            etiquetaLista="Fotos de referencia en el orden en que se envían"
            deshabilitado={ocupado}
            onOrden={(ids) => onCambio("ordenar", ids)}
            className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]"
            claseElemento="flex flex-col gap-2 rounded-tarjeta border border-borde bg-superficie p-2"
          />
        </>
      )}

      <FotosRechazadas
        rechazos={rechazadas}
        medios={tanda}
        ocupado={ocupado}
        onUsarDeTodasFormas={(medioIds) => void anadir(medioIds)}
      />

      {/* Un personaje inventado no admite fotos reales: solo imágenes generadas con IA, con su declaración. */}
      {hueco > 0 && (
        <div className="flex flex-col gap-3">
          <SelectorMedios
            etiqueta={personaje.inventado ? "Añadir imágenes generadas con IA" : "Añadir más fotos"}
            ayuda={
              personaje.inventado
                ? "Imágenes de este personaje hechas con IA, en Escenara o con otro generador (por ejemplo, ChatGPT). Entran como imágenes generadas, nunca como foto."
                : "Solo imágenes. Las que quites de aquí siguen en tu biblioteca: lo que se deshace es la relación con el personaje."
            }
            tipos={["imagen"]}
            multiple
            sinDocumentos
            valor={nuevas}
            onCambio={setNuevas}
          />
          {personaje.inventado && nuevas.length > 0 && (
            <Casilla
              etiqueta="Estas imágenes están generadas con IA y no son de ninguna persona real"
              marcada={declaradasIA}
              onCambio={setDeclaradasIA}
              deshabilitado={ocupado}
            />
          )}
          {nuevas.length > 0 && (
            <Boton
              className="self-start"
              cargando={ocupado}
              disabled={personaje.inventado && !declaradasIA}
              onClick={() => void anadir()}
            >
              Añadir {nuevas.length === 1 ? "la foto" : `las ${nuevas.length} fotos`}
            </Boton>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Qué vista es esta foto. Se ofrecen las vistas que **cuentan** para el tipo de personaje, más la que ya tenga
 * si fuera otra: así una foto clasificada antes no pierde su vista solo porque el catálogo mínimo cambie.
 */
function SelectorDeVista({
  referencia,
  tipo,
  deshabilitado,
  onVista,
}: {
  referencia: ReferenciaVista;
  tipo: PersonajeVista["tipo"];
  deshabilitado: boolean;
  onVista: (vista: Vista | null) => void;
}) {
  const disponibles: Vista[] = [...vistasMinimas(tipo)];
  if (referencia.vistaClave && !disponibles.includes(referencia.vistaClave)) disponibles.push(referencia.vistaClave);
  return (
    <Selector
      etiqueta="Qué vista es"
      valor={referencia.vistaClave ?? SIN_CLASIFICAR}
      deshabilitado={deshabilitado}
      opciones={[
        {
          value: SIN_CLASIFICAR,
          label: "Sin clasificar",
          descripcion: referencia.vista ? `La subiste como «${referencia.vista}»` : "No cubre ninguna vista",
        },
        ...disponibles.map((vista) => ({ value: vista, label: ETIQUETA_VISTA[vista] })),
      ]}
      onCambio={(valor) => onVista(esVista(valor) ? valor : null)}
    />
  );
}
