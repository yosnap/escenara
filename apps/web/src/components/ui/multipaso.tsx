"use client";

import { Check, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { type ReactNode, useContext, useEffect, useId, useReducer, useRef } from "react";
import {
  avisoVigente,
  ETIQUETA_ESTADO_DE_PASO,
  escribirPasoEnLaDireccion,
  estadoInicialMultipaso,
  motivoNoNavegable,
  type PasoDelFlujo,
  reducirMultipaso,
  vecino,
} from "@/lib/multipaso";
import { Alerta } from "./alerta";
import { Boton } from "./button";
import { cn } from "./cn";
import { ContextoPasos } from "./contexto-pasos";

/**
 * **Flujo por pasos** con barra de navegación libre (0.33.0): una barra arriba con cada paso (número, título corto y
 * estado) y los botones Anterior y Siguiente debajo. Solo se ve el contenido del paso actual, así que la pantalla
 * deja de ser una página larguísima.
 *
 * Los paneles de los otros pasos **no se desmontan**: se ocultan con `hidden`. Un trabajo con seguimiento, un envío
 * en curso, un editor abierto o un orden sin guardar siguen vivos aunque cambies de paso, y al volver están igual.
 *
 * Accesibilidad: `nav` con lista ordenada, `aria-current="step"` en el paso actual, foco al título del paso al
 * cambiar, una frase viva que anuncia en qué paso estás, botones de al menos 44 px y todo con el teclado (Tab y
 * Enter). Un paso bloqueado se puede enfocar y, al pulsarlo, dice por qué está bloqueado en lugar de no hacer nada.
 * Sin animaciones: la barra está pegada a zonas de claridad (coste y consentimiento).
 */

/**
 * Estado del flujo: el paso actual, los visitados y el aviso de un paso que no se podía abrir. Vive en quien pinta la
 * pantalla para que una acción (por ejemplo, confirmar un gasto) pueda llevar al paso siguiente. Cambiar de paso
 * reescribe `?paso=` sin recargar, sin añadir entradas al historial y sin tocar los demás parámetros.
 */
export function useMultipaso(
  pasos: readonly PasoDelFlujo[],
  inicial: string,
  /** `false` para no tocar la dirección (la muestra del catálogo, que no es una pantalla de trabajo). */
  enLaDireccion = true,
) {
  const [estado, despachar] = useReducer(reducirMultipaso, undefined, () => estadoInicialMultipaso(pasos, inicial));
  const ir = (id: string) => {
    despachar({ tipo: "ir", id });
    if (enLaDireccion && typeof window !== "undefined") escribirPasoEnLaDireccion(id, window);
  };
  const existe = pasos.some((p) => p.id === estado.actual);
  const primero = pasos[0]?.id;
  // Si el paso actual desaparece de la barra (cambia el camino), se va al primero y se corrige también `?paso=`.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `ir` cambia en cada render; lo que decide es si existe.
  useEffect(() => {
    if (!existe && primero) ir(primero);
  }, [existe, primero]);
  return {
    actual: existe ? estado.actual : (primero ?? estado.actual),
    visitados: estado.visitados,
    enfocar: estado.enfocar,
    estado,
    ir,
    avisar: (id: string) => despachar({ tipo: "avisar", id }),
  };
}

/** Contenido de un paso. Siempre montado; oculto (`hidden`) cuando no es el actual. */
export function PanelDePaso({ id, children }: { id: string; children: ReactNode }) {
  const contexto = useContext(ContextoPasos);
  const activo = contexto?.actual === id;
  return (
    <div data-panel-paso={id} hidden={!activo} tabIndex={-1} className="outline-none">
      {children}
    </div>
  );
}

const CIRCULO: Record<PasoDelFlujo["estado"], string> = {
  hecho: "bg-[color-mix(in_srgb,var(--color-v-cian)_75%,white)] text-[#182032]",
  "en-curso": "bg-[color-mix(in_srgb,var(--color-v-sol)_75%,white)] text-[#182032]",
  pendiente: "border-2 border-borde bg-superficie text-texto",
  bloqueado: "border-2 border-dashed border-borde bg-elevada text-texto-suave",
};

/**
 * Barra de pasos. En móvil se queda en círculos; si aun así no caben (siete pasos en 320 px), la lista se desliza en
 * horizontal en lugar de encoger los botones por debajo de 44 px, y el paso actual se trae a la vista.
 */
export function BarraDePasos({
  etiqueta,
  pasos,
  actual,
  visitados,
  onIr,
  onNoDisponible,
}: {
  etiqueta: string;
  pasos: readonly PasoDelFlujo[];
  actual: string;
  visitados: readonly string[];
  onIr: (id: string) => void;
  /** Se ha pulsado un paso que todavía no se puede abrir (bloqueado o sin alcanzar). */
  onNoDisponible: (paso: PasoDelFlujo) => void;
}) {
  const base = useId();
  const lista = useRef<HTMLOListElement>(null);
  // Solo el desplazamiento horizontal de la barra: la página no se mueve.
  // biome-ignore lint/correctness/useExhaustiveDependencies: se lee el DOM del paso actual; hay que repetirlo al cambiar.
  useEffect(() => {
    const ol = lista.current;
    const boton = ol?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!ol || !boton || ol.scrollWidth <= ol.clientWidth) return;
    ol.scrollLeft = boton.offsetLeft - (ol.clientWidth - boton.offsetWidth) / 2;
  }, [actual]);
  return (
    <nav aria-label={etiqueta}>
      <ol ref={lista} className="relative flex items-start gap-1 overflow-x-auto pb-1 sm:gap-2">
        {pasos.map((paso, i) => {
          const esActual = paso.id === actual;
          const bloqueado = paso.estado === "bloqueado";
          // Bloqueado o todavía sin alcanzar: se puede enfocar y, al pulsarlo, dice por qué no se abre.
          const motivo = esActual ? null : motivoNoNavegable(paso, visitados);
          const idMotivo = `${base}-motivo-${paso.id}`;
          const faltan = paso.pendientes ?? 0;
          return (
            <li key={paso.id} className="min-w-11 flex-1">
              <button
                type="button"
                aria-current={esActual ? "step" : undefined}
                aria-disabled={motivo ? true : undefined}
                aria-describedby={motivo ? idMotivo : undefined}
                onClick={() => (motivo ? onNoDisponible(paso) : esActual ? undefined : onIr(paso.id))}
                className={cn(
                  "flex min-h-11 w-full min-w-11 flex-col items-center gap-1 rounded-control px-0.5 py-1 text-center",
                  "hover:bg-elevada aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent",
                  esActual && "bg-elevada",
                )}
              >
                <span className="relative">
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold sm:size-11 sm:text-base",
                      esActual
                        ? "bg-degradado-chispa text-[#182032] ring-2 ring-foco ring-offset-2 ring-offset-fondo"
                        : CIRCULO[paso.estado],
                    )}
                  >
                    {paso.estado === "hecho" && !esActual ? (
                      <Check className="size-5" />
                    ) : bloqueado ? (
                      <Lock className="size-4" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  {/* Cuántos requisitos faltan en este paso: número y texto, no solo color. */}
                  {faltan > 0 && (
                    <span
                      aria-hidden
                      className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-superficie bg-error text-xs font-bold text-white"
                    >
                      {faltan}
                    </span>
                  )}
                </span>
                {/* Lo visible se oculta al lector: el nombre accesible es la frase completa de abajo, dicha una vez. */}
                <span
                  aria-hidden
                  className={cn(
                    "hidden w-full truncate text-sm sm:block",
                    esActual ? "font-bold text-texto" : "font-medium text-texto-suave",
                  )}
                >
                  {paso.corto}
                </span>
                <span aria-hidden className="hidden text-xs text-texto-suave md:block">
                  {faltan > 0 ? `Faltan ${faltan}` : ETIQUETA_ESTADO_DE_PASO[paso.estado]}
                </span>
                <span className="sr-only">
                  Paso {i + 1}: {paso.titulo} ({ETIQUETA_ESTADO_DE_PASO[paso.estado].toLowerCase()}
                  {faltan > 0 ? `; ${faltan === 1 ? "falta 1 requisito" : `faltan ${faltan} requisitos`}` : ""})
                </span>
              </button>
              {/* Fuera del botón, para que el motivo se lea una sola vez (como descripción). */}
              {motivo && (
                <span id={idMotivo} hidden>
                  {motivo}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Barra, contenido del paso actual y botones Anterior y Siguiente. Los hijos son `PanelDePaso` (y avisos comunes). */
export function Multipaso({
  etiqueta,
  pasos,
  control,
  children,
}: {
  etiqueta: string;
  pasos: readonly PasoDelFlujo[];
  control: ReturnType<typeof useMultipaso>;
  children: ReactNode;
}) {
  const { actual, visitados, ir, enfocar, avisar, estado } = control;
  const contenedor = useRef<HTMLDivElement>(null);
  // El aviso solo se enseña mientras sea verdad: al cambiar de paso o al desbloquearse el paso, desaparece.
  const aviso = avisoVigente(estado, pasos);
  const indice = Math.max(
    0,
    pasos.findIndex((p) => p.id === actual),
  );
  const pasoActual = pasos[indice];
  const anterior = vecino(pasos, actual, -1);
  const siguiente = vecino(pasos, actual, 1);
  const idMotivoSiguiente = useId();

  // Al cambiar de paso (no al abrir la pantalla), el foco va al título del paso para que el lector de pantalla lo lea
  // y el teclado siga desde ahí. Si el panel no tiene título propio, va al panel.
  useEffect(() => {
    if (!enfocar) return;
    const panel = contenedor.current?.querySelector<HTMLElement>(`[data-panel-paso="${actual}"]`);
    const titulo = panel?.querySelector<HTMLElement>("[data-titulo-paso]");
    (titulo ?? panel)?.focus();
  }, [actual, enfocar]);

  const cambiar = ir;
  const siguienteBloqueado = siguiente?.estado === "bloqueado";

  return (
    <div ref={contenedor} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BarraDePasos
          etiqueta={etiqueta}
          pasos={pasos}
          actual={actual}
          visitados={visitados}
          onIr={cambiar}
          onNoDisponible={(paso) => avisar(paso.id)}
        />
        {/* En móvil la barra solo enseña círculos: esta frase dice dónde estás. También es la que se anuncia. */}
        <p aria-live="polite" className="text-center text-sm font-semibold text-texto sm:sr-only">
          Paso {indice + 1} de {pasos.length}: {pasoActual?.titulo}
        </p>
        {aviso && (
          <Alerta tipo="bloqueo" compacta>
            «{aviso.paso.titulo}» todavía no está disponible. {aviso.motivo}
          </Alerta>
        )}
      </div>

      {/* Lo de dentro (una alerta) puede llevar a otro paso sin saltarse un candado. */}
      <ContextoPasos.Provider
        value={{
          actual,
          ir: cambiar,
          avisar,
          estaBloqueado: (id) => pasos.find((p) => p.id === id)?.estado === "bloqueado",
        }}
      >
        {children}
      </ContextoPasos.Provider>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde/50 pt-4">
        {anterior ? (
          <Boton variante="secundario" onClick={() => cambiar(anterior.id)} disabled={anterior.estado === "bloqueado"}>
            <ChevronLeft className="size-5" aria-hidden />
            Anterior<span className="sr-only">: {anterior.titulo}</span>
          </Boton>
        ) : (
          <span />
        )}
        {siguiente && (
          <div className="flex flex-col items-end gap-1">
            <Boton
              variante="primario"
              aria-disabled={siguienteBloqueado || undefined}
              aria-describedby={siguienteBloqueado ? idMotivoSiguiente : undefined}
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              onClick={() => (siguienteBloqueado ? avisar(siguiente.id) : cambiar(siguiente.id))}
            >
              Siguiente: {siguiente.corto}
              <ChevronRight className="size-5" aria-hidden />
            </Boton>
            {siguienteBloqueado && (
              <p id={idMotivoSiguiente} className="max-w-sm text-right text-sm text-texto-suave">
                {siguiente.motivo}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
