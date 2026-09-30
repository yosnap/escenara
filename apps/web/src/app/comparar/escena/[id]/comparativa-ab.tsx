"use client";

import { useCallback, useEffect, useState } from "react";
import { Alerta } from "@/components/ui/alerta";
import { Boton } from "@/components/ui/button";
import { ConfirmacionAB } from "@/components/ui/comparativas/confirmacion-ab";
import { ResultadosAB } from "@/components/ui/comparativas/resultados-ab";
import {
  type ComparativaVista,
  type EstimacionAlternativa,
  type PeticionAB,
  type PreparacionAB,
  renovarClaveTrasFallo,
} from "@/lib/comparativas";

/** Cada cuánto se vuelve a mirar una comparativa con alternativas en marcha. Solo lee: no cuesta nada. */
const MS_REFRESCO = 5000;

type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string; red?: boolean };

async function pedir<T>(url: string, init?: RequestInit): Promise<Resultado<T>> {
  try {
    const r = await fetch(url, init);
    const cuerpo = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, error: cuerpo?.error ?? `El servidor ha respondido ${r.status}.` };
    return { ok: true, datos: cuerpo as T };
  } catch {
    return {
      ok: false,
      red: true,
      error:
        "Sin conexión con el servidor: no se sabe si la petición llegó. Vuelve a cargar la página antes de repetir; si la repites con la misma confirmación no se cobra dos veces.",
    };
  }
}

const json = (cuerpo: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(cuerpo),
});

/**
 * Comparativa A/B de una escena: elegir dos modelos, ver lo que costará, confirmarlo y, después, ver los resultados lado
 * a lado y elegir ganadora. Quien decide todo es el servidor; esto solo pinta y manda.
 */
export function ComparativaAB({
  preparacion,
  inicial,
}: {
  preparacion: PreparacionAB;
  inicial: ComparativaVista | null;
}) {
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [estimacion, setEstimacion] = useState<EstimacionAlternativa[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [comparativa, setComparativa] = useState<ComparativaVista | null>(inicial);
  const [nueva, setNueva] = useState(inicial === null);

  // La estimación se pide al servidor con el catálogo en cuanto hay dos modelos: no gasta nada.
  useEffect(() => {
    setEstimacion(null);
    if (elegidos.length !== 2) return;
    let vigente = true;
    setCargando(true);
    const q = encodeURIComponent(elegidos.join(","));
    pedir<{ alternativas: EstimacionAlternativa[] }>(`/api/escenas/${preparacion.escenaId}/comparativa?modelos=${q}`)
      .then((r) => {
        if (!vigente) return;
        if (r.ok) setEstimacion(r.datos.alternativas);
        else setError(r.error);
      })
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [elegidos, preparacion.escenaId]);

  const refrescar = useCallback(async (id: string) => {
    const r = await pedir<ComparativaVista>(`/api/comparativas/${id}`);
    if (r.ok) setComparativa(r.datos);
  }, []);

  // Mientras alguna alternativa siga en marcha, se vuelve a leer su estado real. Nunca se inventa progreso.
  useEffect(() => {
    if (!comparativa || comparativa.terminada) return;
    const t = window.setInterval(() => void refrescar(comparativa.id), MS_REFRESCO);
    return () => window.clearInterval(t);
  }, [comparativa, refrescar]);

  const lanzar = async (peticion: PeticionAB) => {
    setOcupado(true);
    setError(null);
    const r = await pedir<ComparativaVista>(`/api/escenas/${preparacion.escenaId}/comparativa`, json(peticion));
    setOcupado(false);
    if (!r.ok) {
      setError(r.error);
      // Tras una respuesta del servidor, la próxima confirmación es otra; tras un fallo de red, la misma.
      if (renovarClaveTrasFallo(r)) setIntento((i) => i + 1);
      return;
    }
    setComparativa(r.datos);
    setNueva(false);
  };

  const elegir = async (trabajoId: string) => {
    if (!comparativa) return;
    setOcupado(true);
    setError(null);
    const r = await pedir<ComparativaVista>(`/api/comparativas/${comparativa.id}/ganadora`, json({ trabajoId }));
    setOcupado(false);
    if (r.ok) setComparativa(r.datos);
    else setError(r.error);
  };

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <Alerta tipo="error" anuncio="alerta" titulo="No se ha hecho" descartable onDescartar={() => setError(null)}>
          {error}
        </Alerta>
      )}
      {comparativa && !nueva ? (
        <section aria-labelledby="resultados" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="resultados" className="text-2xl font-bold text-texto">
              Resultados lado a lado
            </h2>
            {comparativa.terminada && (
              <Boton
                variante="fantasma"
                tamano="sm"
                onClick={() => {
                  setNueva(true);
                  setElegidos([]);
                }}
              >
                Hacer otra comparativa
              </Boton>
            )}
          </div>
          <ResultadosAB comparativa={comparativa} ocupado={ocupado} onElegir={elegir} />
        </section>
      ) : (
        <section aria-labelledby="nueva" className="flex flex-col gap-3">
          <h2 id="nueva" className="text-2xl font-bold text-texto">
            Nueva comparativa
          </h2>
          <ConfirmacionAB
            preparacion={preparacion}
            elegidos={elegidos}
            onElegidos={setElegidos}
            estimacion={estimacion}
            cargandoEstimacion={cargando}
            ocupado={ocupado}
            intento={intento}
            onEnviar={lanzar}
          />
        </section>
      )}
    </div>
  );
}
