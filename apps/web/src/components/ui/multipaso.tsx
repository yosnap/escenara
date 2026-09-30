"use client";

import { Check, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { createContext, type ReactNode, useContext, useEffect, useId, useRef, useState } from "react";
import {
  direccionConPaso,
  ETIQUETA_ESTADO_DE_PASO,
  esNavegable,
  type PasoDelFlujo,
  vecino,
  visitadosAlAbrir,
} from "@/lib/multipaso";
import { Boton } from "./button";
import { cn } from "./cn";
import { Aviso } from "./feedback";

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

interface ControlMultipaso {
  actual: string;
  visitados: string[];
  ir: (id: string) => void;
}

/**
 * Estado del flujo: el paso actual y los visitados. Vive en quien pinta la pantalla para que una acción (por ejemplo,
 * confirmar un gasto) pueda llevar al paso siguiente. Cambiar de paso reescribe `?paso=` sin recargar y sin tocar los
 * demás parámetros de la dirección.
 */
export function useMultipaso(
  pasos: readonly PasoDelFlujo[],
  inicial: string,
  /** `false` para no tocar la dirección (la muestra del catálogo, que no es una pantalla de trabajo). */
  enLaDireccion = true,
): ControlMultipaso & { enfocar: boolean } {
  const [actual, setActual] = useState(inicial);
  const [visitados, setVisitados] = useState(() => visitadosAlAbrir(pasos, inicial));
  const [enfocar, setEnfocar] = useState(false);
  const ir = (id: string) => {
    setActual(id);
    setEnfocar(true);
    setVisitados((antes) => (antes.includes(id) ? antes : [...antes, id]));
    if (enLaDireccion && typeof window !== "undefined") {
      window.history.replaceState(null, "", direccionConPaso(window.location.href, id));
    }
  };
  // Si el paso actual desaparece de la lista (cambia el camino), se vuelve al primero en lugar de dejar la pantalla vacía.
  const actualValido = pasos.some((p) => p.id === actual) ? actual : (pasos[0]?.id ?? actual);
  return { actual: actualValido, visitados, ir, enfocar };
}

const ContextoMultipaso = createContext<{ actual: string } | null>(null);

/** Contenido de un paso. Siempre montado; oculto (`hidden`) cuando no es el actual. */
export function PanelDePaso({ id, children }: { id: string; children: ReactNode }) {
  const contexto = useContext(ContextoMultipaso);
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

/** Barra de pasos: se compacta en móvil (solo los círculos) y no desborda con seis pasos en 320 px. */
export function BarraDePasos({
  etiqueta,
  pasos,
  actual,
  visitados,
  onIr,
  onBloqueado,
}: {
  etiqueta: string;
  pasos: readonly PasoDelFlujo[];
  actual: string;
  visitados: readonly string[];
  onIr: (id: string) => void;
  onBloqueado: (paso: PasoDelFlujo) => void;
}) {
  const base = useId();
  return (
    <nav aria-label={etiqueta}>
      <ol className="flex items-start gap-1 sm:gap-2">
        {pasos.map((paso, i) => {
          const esActual = paso.id === actual;
          const bloqueado = paso.estado === "bloqueado";
          const navegable = esNavegable(paso, visitados);
          const idMotivo = `${base}-motivo-${paso.id}`;
          return (
            <li key={paso.id} className="min-w-0 flex-1">
              <button
                type="button"
                aria-current={esActual ? "step" : undefined}
                aria-disabled={bloqueado || undefined}
                aria-describedby={bloqueado && paso.motivo ? idMotivo : undefined}
                disabled={!bloqueado && !navegable && !esActual}
                onClick={() => (bloqueado ? onBloqueado(paso) : esActual ? undefined : onIr(paso.id))}
                className={cn(
                  "flex min-h-11 w-full flex-col items-center gap-1 rounded-control px-0.5 py-1 text-center",
                  "hover:bg-elevada disabled:cursor-default disabled:hover:bg-transparent",
                  "aria-disabled:cursor-not-allowed",
                  esActual && "bg-elevada",
                )}
              >
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
                <span
                  className={cn(
                    "hidden w-full truncate text-sm sm:block",
                    esActual ? "font-bold text-texto" : "font-medium text-texto-suave",
                  )}
                >
                  {paso.corto}
                </span>
                <span className="hidden text-xs text-texto-suave md:block">{ETIQUETA_ESTADO_DE_PASO[paso.estado]}</span>
                <span className="sr-only">
                  Paso {i + 1}: {paso.titulo} ({ETIQUETA_ESTADO_DE_PASO[paso.estado].toLowerCase()})
                </span>
                {bloqueado && paso.motivo && (
                  <span id={idMotivo} className="sr-only">
                    {paso.motivo}
                  </span>
                )}
              </button>
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
  const { actual, visitados, ir, enfocar } = control;
  const contenedor = useRef<HTMLDivElement>(null);
  const [bloqueoVisto, setBloqueoVisto] = useState<PasoDelFlujo | null>(null);
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

  const cambiar = (id: string) => {
    setBloqueoVisto(null);
    ir(id);
  };
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
          onBloqueado={setBloqueoVisto}
        />
        {/* En móvil la barra solo enseña círculos: esta frase dice dónde estás. También es la que se anuncia. */}
        <p aria-live="polite" className="text-center text-sm font-semibold text-texto sm:sr-only">
          Paso {indice + 1} de {pasos.length}: {pasoActual?.titulo}
        </p>
        {bloqueoVisto && (
          <Aviso tono="info">
            «{bloqueoVisto.titulo}» todavía no está disponible. {bloqueoVisto.motivo}
          </Aviso>
        )}
      </div>

      <ContextoMultipaso.Provider value={{ actual }}>{children}</ContextoMultipaso.Provider>

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
              onClick={() => (siguienteBloqueado ? setBloqueoVisto(siguiente) : cambiar(siguiente.id))}
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
