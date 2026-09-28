"use client";

import { ScanEye } from "lucide-react";
import { useRef, useState } from "react";
import { Boton } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
import { Aviso } from "@/components/ui/feedback";
import type { CorreccionHumana } from "@/lib/coherencia";
import { formatearCreditos } from "@/lib/generacion";
import {
  type AccionRevision,
  DESCRIPCION_SEVERIDAD,
  type EscenaRevisionVista,
  ETIQUETA_SEVERIDAD,
  ETIQUETA_TIPO_REVISION,
  ETIQUETA_VEREDICTO,
  esRevisable,
  faltaRevisionHumana,
  type RevisionProyectoVista,
} from "@/lib/revision";
import { ComparadorContinuidad } from "./comparador-continuidad";
import { DecisionHumana } from "./decision-humana";
import { ListaComprobaciones } from "./lista-comprobaciones";
import { PanelCoherencia } from "./panel-coherencia";

/**
 * Una escena en la pantalla de revisión: su clip junto a sus referencias, lo que se midió del archivo con su valor, y
 * las tres decisiones de la persona que lo mira.
 *
 * Lo que esta tarjeta no hace nunca: dar por buena una escena porque sus comprobaciones técnicas pasen. Mientras no
 * haya revisión humana vigente lo dice, y la insignia de severidad sale de las revisiones que hay, no de un cálculo
 * del navegador.
 */
export function TarjetaRevision({
  escena,
  proyecto,
  ocupado,
  onComprobar,
  onDecidir,
  onMultimodal,
  onCoherencia,
  onCorregirCoherencia,
}: {
  escena: EscenaRevisionVista;
  proyecto: RevisionProyectoVista;
  ocupado: boolean;
  onComprobar: () => void;
  onDecidir: (accion: AccionRevision, motivo: string) => void;
  onMultimodal: (confirmacion: { avisoUmbralAceptado: boolean; claveIdempotencia: string }) => void;
  onCoherencia: () => void;
  onCorregirCoherencia: (decisionId: string, correccion: CorreccionHumana) => void;
}) {
  const revisable = esRevisable(escena);

  return (
    <article className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-texto-suave">
            Escena {escena.orden} · {escena.segundos} s
          </p>
          <h3 className="text-lg font-bold text-texto">{escena.resumen}</h3>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-semibold ${
            escena.severidad === "critica"
              ? "border-error/45 text-error"
              : escena.severidad === "aviso"
                ? "border-aviso/45 text-aviso"
                : "border-correcto/45 text-correcto"
          }`}
        >
          {ETIQUETA_SEVERIDAD[escena.severidad]}
        </span>
      </header>

      <p className="text-sm text-texto-suave">{DESCRIPCION_SEVERIDAD[escena.severidad]}</p>

      {escena.bloquea && <Aviso tono="error">{escena.motivoBloqueo}</Aviso>}

      <ComparadorContinuidad
        clip={escena.clip}
        fotogramaAprobado={escena.fotogramaAprobado}
        hojaDePersonaje={escena.hojaDePersonaje}
        orden={escena.orden}
      />

      {!revisable ? (
        <Aviso tono="info">
          Esta escena todavía no tiene clip, así que no hay nada que revisar. Prodúcela y aprueba su fotograma para que
          se anime.
        </Aviso>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-bold text-texto">Comprobación automática del archivo</h4>
              <Boton variante="secundario" tamano="sm" cargando={ocupado} onClick={onComprobar}>
                {escena.automatica ? "Volver a comprobar" : "Comprobar el clip"}
              </Boton>
            </div>
            {escena.automatica ? (
              <ListaComprobaciones revision={escena.automatica} />
            ) : (
              <p className="text-sm text-texto-suave">
                Todavía no se ha comprobado. Es gratis: se mide el archivo que ya está en tu biblioteca, no se llama a
                ningún proveedor y no se gasta ni un crédito.
              </p>
            )}
          </section>

          {faltaRevisionHumana(escena) && (
            <Aviso tono="info">
              Falta tu revisión. Las comprobaciones técnicas no sustituyen a mirar el clip: miden el archivo, no si el
              personaje sigue siendo el mismo.
            </Aviso>
          )}

          {escena.humana && (
            <p className="text-sm text-texto-suave">
              {ETIQUETA_TIPO_REVISION.humana}: <strong>{ETIQUETA_VEREDICTO[escena.humana.veredicto]}</strong>
              {escena.humana.notas === "" ? "" : ` — ${escena.humana.notas}`}
            </p>
          )}

          <DecisionHumana ocupado={ocupado} onDecidir={onDecidir} />

          <RevisionConModelo escena={escena} proyecto={proyecto} ocupado={ocupado} onPedir={onMultimodal} />

          <PanelCoherencia
            decisiones={escena.coherencia}
            ocupado={ocupado}
            onComprobar={onCoherencia}
            onCorregir={onCorregirCoherencia}
          />
        </>
      )}

      {escena.historial.length > 0 && <Historial escena={escena} />}
    </article>
  );
}

/**
 * Revisión con modelo: **cuesta créditos y se confirma una por una**. Cuando no está disponible se dice por qué y no
 * se ofrece ningún botón, en lugar de dejar uno que falle al pulsarlo.
 */
function RevisionConModelo({
  escena,
  proyecto,
  ocupado,
  onPedir,
}: {
  escena: EscenaRevisionVista;
  proyecto: RevisionProyectoVista;
  ocupado: boolean;
  onPedir: (confirmacion: { avisoUmbralAceptado: boolean; claveIdempotencia: string }) => void;
}) {
  const [aceptado, setAceptado] = useState(false);
  const superaUmbral = proyecto.creditosPorMultimodal > proyecto.umbralAvisoCreditos;
  /**
   * Clave de esta confirmación, **estable mientras no cambie lo que se confirma** (misma escena, mismo clip, mismo
   * precio): un doble clic o un reintento tras un error de red mandan la misma clave, así que el servidor devuelve
   * la revisión que ya existe en lugar de pagar otra vez. Mismo patrón que `panel-generar.tsx`.
   */
  const clave = useRef<{ firma: string; valor: string } | null>(null);
  const firma = `${escena.id}|${escena.clip?.id ?? ""}|${proyecto.selloMultimodal}|${proyecto.creditosPorMultimodal}`;

  const pedir = () => {
    if (clave.current?.firma !== firma) clave.current = { firma, valor: crypto.randomUUID() };
    onPedir({ avisoUmbralAceptado: aceptado, claveIdempotencia: clave.current.valor });
  };

  if (!proyecto.multimodalDisponible) {
    return (
      <section className="rounded-tarjeta border-2 border-borde bg-superficie p-4">
        <h4 className="font-bold text-texto">Revisión con modelo</h4>
        <p className="mt-1 text-sm text-texto-suave">{proyecto.motivoSinMultimodal}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-4">
      <div>
        <h4 className="font-bold text-texto">Revisión con modelo</h4>
        <p className="mt-1 text-sm text-texto-suave">
          Le pide a un modelo que mire el clip y describa lo que ve. Es una opinión más, no un veredicto: la identidad
          la validas tú. <strong>Cuesta créditos de tu cuenta del proveedor</strong> y se pide escena a escena.
        </p>
      </div>
      <p className="font-mono text-lg font-bold text-texto">
        {formatearCreditos(proyecto.creditosPorMultimodal)} (estimación)
      </p>
      {superaUmbral && (
        <Casilla
          etiqueta={`Sé que esta revisión pasa de ${formatearCreditos(proyecto.umbralAvisoCreditos)}`}
          descripcion="Aviso de gasto alto de esta instalación: hay que aceptarlo expresamente antes de pedirla."
          marcada={aceptado}
          onCambio={setAceptado}
        />
      )}
      <Boton
        variante="secundario"
        tamano="sm"
        icono={<ScanEye className="size-4" />}
        className="self-start"
        cargando={ocupado}
        disabled={superaUmbral && !aceptado}
        onClick={pedir}
      >
        Pedir la opinión del modelo
      </Boton>
      {escena.multimodal && (
        <p className="rounded-control bg-elevada p-3 text-sm text-texto">
          {escena.multimodal.notas === "" ? "El modelo no ha devuelto nada legible." : escena.multimodal.notas}
          {escena.multimodal.creditos !== null && (
            <span className="mt-1 block text-texto-suave">
              Costó {formatearCreditos(escena.multimodal.creditos)}, apuntados en tu registro de gasto.
            </span>
          )}
        </p>
      )}
      <p className="text-sm text-texto-suave">
        El importe final lo decide el proveedor y se paga con tu propia clave. Escenara solo estima con el precio que
        tiene registrado.
      </p>
    </section>
  );
}

/** Historial completo de la escena, incluidas las revisiones que dejaron de valer y por qué. */
function Historial({ escena }: { escena: EscenaRevisionVista }) {
  return (
    <details className="rounded-tarjeta border-2 border-borde p-4">
      <summary className="cursor-pointer font-semibold text-texto">
        Historial de revisiones ({escena.historial.length})
      </summary>
      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {escena.historial.map((revision) => (
          <li key={revision.id} className="rounded-control bg-elevada p-3">
            <p className="font-semibold text-texto">
              {ETIQUETA_TIPO_REVISION[revision.tipo]} · {ETIQUETA_VEREDICTO[revision.veredicto]} ·{" "}
              {ETIQUETA_SEVERIDAD[revision.severidad]}
            </p>
            <p className="text-texto-suave">
              {new Date(revision.creadoEn).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })} · reglas{" "}
              {revision.reglasVersion}
              {revision.creditos === null ? " · sin coste" : ` · ${formatearCreditos(revision.creditos)}`}
            </p>
            {revision.notas !== "" && <p className="mt-1 text-texto">{revision.notas}</p>}
            {revision.invalidada && (
              <p className="mt-1 text-texto-suave">
                Ya no vale: {revision.motivoInvalidacion || "algo cambió después de revisarla."}
              </p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
