"use client";

import Link from "next/link";
import { useState } from "react";
import { Alerta } from "@/components/ui/alerta";
import { claseBoton } from "@/components/ui/button";
import { Aviso, EstadoVacio } from "@/components/ui/feedback";
import {
  type AccionRevision,
  bloqueosDeExportacion,
  faltaRevisionHumana,
  type RevisionProyectoVista,
  textoDeBloqueo,
} from "@/lib/revision";
import {
  comprobarClip,
  comprobarCoherencia,
  corregirCoherencia,
  decidirRevision,
  revisarConModelo,
} from "./api-revision";
import { TarjetaRevision } from "./tarjeta-revision";

/**
 * Revisión de continuidad de un proyecto (RF07, 0.20.0): escena a escena, el clip junto a la hoja de personaje y al
 * fotograma aprobado, lo que se midió del archivo y la decisión de la persona que lo mira.
 *
 * Aquí **no hay sondeo**: nada de esta pantalla cambia por su cuenta. Cada acción devuelve el estado de revisión
 * completo del servidor y se adopta tal cual, así que lo que se ve nunca es un cálculo del navegador (en Escenara no
 * se usa `useEffect` directo, y aquí no hace falta ningún temporizador).
 */
export function VistaRevision({ inicial }: { inicial: RevisionProyectoVista }) {
  const [revision, setRevision] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ejecutar = async (
    accion: () => Promise<{ ok: true; datos: RevisionProyectoVista } | { ok: false; error: string }>,
  ) => {
    setOcupado(true);
    setError(null);
    const resultado = await accion();
    setOcupado(false);
    if (resultado.ok) setRevision(resultado.datos);
    else setError(resultado.error);
  };

  const bloqueos = bloqueosDeExportacion(revision.escenas);
  const sinRevisar = revision.escenas.filter(faltaRevisionHumana).length;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/proyectos/${revision.proyectoId}/produccion`}
            className="text-sm font-semibold text-acento hover:underline"
          >
            ← La producción del proyecto
          </Link>
          <h1 className="mt-1 text-4xl font-bold text-texto">Revisión: {revision.titulo}</h1>
          <p className="mt-2 text-texto-suave">
            {revision.revisables} de {revision.escenas.length}{" "}
            {revision.escenas.length === 1 ? "escena tiene clip" : "escenas tienen clip"} y se pueden revisar
            {sinRevisar > 0 ? ` · ${sinRevisar} sin tu revisión` : ""}
          </p>
        </div>
        <Link href={`/proyectos/${revision.proyectoId}`} className={claseBoton("secundario", "sm")}>
          El plan del proyecto
        </Link>
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}

      <Alerta
        // «Hecho» solo cuando de verdad hay algo listo: sin escenas no hay nada que exportar.
        tipo={bloqueos.length > 0 ? "bloqueo" : revision.escenas.length > 0 ? "hecho" : "info"}
        etiqueta="Estado de la exportación"
        titulo={textoDeBloqueo(revision.escenas)}
        anuncio="ninguno"
        protege
        elementos={bloqueos.map((texto) => ({ texto }))}
      />

      {revision.escenas.length === 0 ? (
        <EstadoVacio
          nivel={2}
          titulo="Este proyecto no tiene escenas"
          texto="Vuelve al plan, escribe su guion y apruébalo: solo se revisa lo que se ha producido."
          accion={
            <Link href={`/proyectos/${revision.proyectoId}`} className={claseBoton("primario")}>
              Ir al plan
            </Link>
          }
        />
      ) : (
        <ol className="flex flex-col gap-5">
          {revision.escenas.map((escena) => (
            <li key={escena.id}>
              <TarjetaRevision
                escena={escena}
                proyecto={revision}
                ocupado={ocupado}
                onComprobar={() => void ejecutar(() => comprobarClip(revision.proyectoId, escena.id))}
                onDecidir={(accion: AccionRevision, motivo: string) =>
                  void ejecutar(() => decidirRevision(revision.proyectoId, escena.id, accion, motivo))
                }
                /*
                  El aviso de gasto alto y la clave de la confirmación llegan desde la tarjeta: el aviso nunca se da
                  por aceptado aquí, y la clave es la suya, estable mientras no cambie lo que se confirma.
                */
                onCoherencia={() => void ejecutar(() => comprobarCoherencia(revision.proyectoId, escena.id))}
                onCorregirCoherencia={(decisionId, correccion) =>
                  void ejecutar(() => corregirCoherencia(revision.proyectoId, escena.id, decisionId, correccion))
                }
                onMultimodal={(confirmacion) =>
                  void ejecutar(() =>
                    revisarConModelo(revision.proyectoId, escena.id, {
                      creditosConfirmados: revision.creditosPorMultimodal,
                      selloEstimacion: revision.selloMultimodal,
                      ...confirmacion,
                    }),
                  )
                }
              />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
