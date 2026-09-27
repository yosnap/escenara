"use client";

import { CheckCircle2, GitCompare, History, Images, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso, EstadoVacio } from "@/components/ui/feedback";
import { MiniaturaMedio } from "@/components/ui/media/miniatura-medio";
import { generarHojaDePersonaje, listarVersiones } from "@/components/ui/personajes/api-personajes";
import { ETIQUETA_TIPO_APROBACION, type HistorialVersiones, type PersonajeVista } from "@/lib/personajes";
import { CompararVersiones } from "./comparar-versiones";

/**
 * Pestaña «Versiones»: el historial de la ficha con qué cambió en cada versión, qué aprobaciones se
 * invalidaron, la hoja de personaje y la comparación lado a lado de dos versiones.
 *
 * El historial se pide **al abrir la pestaña** (no al cargar la ficha): así ver un personaje no arrastra una
 * consulta que casi nadie mira. Las versiones no se pueden borrar: son la trazabilidad de lo ya generado y
 * solo desaparecen al borrar el personaje.
 */
export function PanelVersiones({
  personaje,
  onPersonaje,
}: {
  personaje: PersonajeVista;
  onPersonaje: (personaje: PersonajeVista) => void;
}) {
  const [historial, setHistorial] = useState<HistorialVersiones | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [componiendo, setComponiendo] = useState(false);
  const [comparando, setComparando] = useState<{ izquierda: string; derecha: string } | null>(null);

  const cargar = async () => {
    setCargando(true);
    setError(null);
    const respuesta = await listarVersiones(personaje.id);
    setCargando(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    setHistorial(respuesta.datos);
    const [primera, segunda] = respuesta.datos.versiones;
    setComparando(primera && segunda ? { izquierda: segunda.id, derecha: primera.id } : null);
  };

  const componerHoja = async () => {
    setComponiendo(true);
    setError(null);
    const respuesta = await generarHojaDePersonaje(personaje.id);
    setComponiendo(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    onPersonaje({
      ...personaje,
      versionVigente: personaje.versionVigente
        ? { ...personaje.versionVigente, hoja: respuesta.datos.hoja }
        : personaje.versionVigente,
    });
    await cargar();
  };

  const pendientes = historial?.aprobaciones.filter((a) => a.invalidada) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Boton variante="secundario" icono={<History className="size-4" />} cargando={cargando} onClick={cargar}>
          {historial ? "Actualizar el historial" : "Ver el historial de versiones"}
        </Boton>
        <Boton
          variante="secundario"
          icono={<RefreshCw className="size-4" />}
          cargando={componiendo}
          onClick={componerHoja}
        >
          {personaje.versionVigente?.hoja ? "Rehacer la hoja de personaje" : "Componer la hoja de personaje"}
        </Boton>
        <p className="text-sm text-texto-suave">
          La hoja la monta el servidor con sus fotos: no cuesta créditos y rehacerla es gratis.
        </p>
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}

      {personaje.versionVigente?.hoja && (
        <section aria-label="Hoja de personaje" className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-xl font-bold text-texto">
            <span aria-hidden>
              <Images className="size-5" />
            </span>
            <span>Hoja de personaje · versión {personaje.versionVigente.numero}</span>
          </h3>
          <span className="block overflow-hidden rounded-tarjeta border-2 border-borde bg-elevada">
            <MiniaturaMedio medio={personaje.versionVigente.hoja} className="h-auto w-full object-contain" />
          </span>
        </section>
      )}

      {pendientes.length > 0 && (
        <Aviso tono="error">
          <span className="flex flex-col gap-1">
            <span className="font-semibold">
              {pendientes.length === 1
                ? "Una aprobación ha quedado invalidada y hay que revisarla:"
                : `${pendientes.length} aprobaciones han quedado invalidadas y hay que revisarlas:`}
            </span>
            {pendientes.map((aprobacion) => (
              <span key={aprobacion.id}>
                <strong className="font-semibold">
                  {ETIQUETA_TIPO_APROBACION[aprobacion.tipo]}
                  {aprobacion.asunto && ` · ${aprobacion.asunto}`}
                </strong>{" "}
                {aprobacion.motivoInvalidacion}
              </span>
            ))}
          </span>
        </Aviso>
      )}

      {historial && historial.versiones.length > 0 && (
        <ol className="flex flex-col gap-3">
          {historial.versiones.map((version) => (
            <li
              key={version.id}
              className="flex flex-col gap-2 rounded-tarjeta border-2 border-borde bg-superficie p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="flex items-center gap-2 text-lg font-bold text-texto">
                  <span>Versión {version.numero}</span>
                  {version.vigente && (
                    <span className="inline-flex items-center gap-1 rounded-full border-2 border-correcto/45 px-2 py-0.5 text-xs font-bold text-correcto">
                      <span aria-hidden>
                        <CheckCircle2 className="size-3" />
                      </span>
                      <span>Vigente</span>
                    </span>
                  )}
                </h3>
                <p className="text-sm text-texto-suave">
                  {new Date(version.creadaEn).toLocaleString("es-ES")} · {version.totalReferencias}{" "}
                  {version.totalReferencias === 1 ? "foto" : "fotos"}
                </p>
              </div>
              {version.motivo && <p className="text-texto">«{version.motivo}»</p>}
              {version.diferencias.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {version.diferencias.map((diferencia) => (
                    <li
                      key={diferencia.campo}
                      className="rounded-full border-2 border-acento/45 px-2.5 py-0.5 text-xs font-semibold text-acento"
                    >
                      {diferencia.etiqueta}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-texto-suave">Primera versión: es el punto de partida del personaje.</p>
              )}
              {version.aprobacionesInvalidadas > 0 && (
                <p className="flex items-center gap-2 text-sm font-semibold text-aviso">
                  <span aria-hidden>
                    <TriangleAlert className="size-4" />
                  </span>
                  <span>
                    Invalidó {version.aprobacionesInvalidadas}{" "}
                    {version.aprobacionesInvalidadas === 1 ? "aprobación" : "aprobaciones"}.
                  </span>
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      {historial && historial.versiones.length > 1 && comparando && (
        <section aria-label="Comparar dos versiones" className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 text-xl font-bold text-texto">
            <span aria-hidden>
              <GitCompare className="size-5" />
            </span>
            <span>Comparar dos versiones</span>
          </h3>
          <CompararVersiones
            versiones={historial.versiones}
            izquierda={comparando.izquierda}
            derecha={comparando.derecha}
            onIzquierda={(id) => setComparando({ ...comparando, izquierda: id })}
            onDerecha={(id) => setComparando({ ...comparando, derecha: id })}
          />
        </section>
      )}

      {!historial && !cargando && (
        <EstadoVacio
          titulo="Historial sin cargar"
          texto="Pulsa «Ver el historial de versiones» para ver qué cambió en cada una y comparar dos."
        />
      )}
    </div>
  );
}
