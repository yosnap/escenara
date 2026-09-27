"use client";

import { Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo } from "@/components/ui/field";
import { Paso } from "@/components/ui/paso";
import { SelectorPersonaje } from "@/components/ui/personaje";
import { type ClaveConfirmacion, claveEstable } from "@/lib/asistente";
import { formatearCreditos, formatearEuros } from "@/lib/generacion";
import type { PersonajeElegible } from "@/lib/personajes";
import { CONCEPTO_MAXIMO, ESCENAS_SUGERIDAS, formatearFecha, IDEA_MAXIMA, type ProyectoDetalle } from "@/lib/proyectos";
import { editarProyecto, pedirGuion } from "../../_componentes/api-proyectos";

/**
 * Idea, protagonista y concepto, con el asistente al lado.
 *
 * El botón del asistente es el único de la página que gasta dinero, así que va con su **zona de claridad**: lo
 * que cuesta, con la palabra «estimación» y la fecha del precio, y la clave de idempotencia que se genera al
 * confirmar (repetir el clic no encarga un segundo guion). Lo que devuelve es una **propuesta**: sustituye las
 * escenas en borrador y hay que revisarla y aprobarla.
 */
export function PanelIdea({
  detalle,
  personajes,
  onCambio,
  onError,
}: {
  detalle: ProyectoDetalle;
  personajes: PersonajeElegible[];
  onCambio: (detalle: ProyectoDetalle) => void;
  onError: (mensaje: string) => void;
}) {
  const { proyecto, estimacionAsistente } = detalle;
  const [idea, setIdea] = useState(proyecto.idea);
  const [concepto, setConcepto] = useState(proyecto.concepto);
  const [guardando, setGuardando] = useState(false);
  const [escribiendo, setEscribiendo] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);
  /**
   * Clave de la confirmación, **estable mientras no cambie lo que se confirma** (mismo patrón que
   * `panel-generar.tsx`). Si se generara una nueva en cada clic, un doble clic o un reintento tras un error de
   * red pedirían **dos** guiones y se cobrarían los dos: la idempotencia del servidor solo protege si la clave
   * es la misma.
   */
  const clave = useRef<ClaveConfirmacion | null>(null);

  const guardar = async (cambios: Record<string, unknown>) => {
    setGuardando(true);
    const resultado = await editarProyecto(proyecto.id, cambios);
    setGuardando(false);
    if (!resultado.ok) {
      onError(resultado.error);
      return;
    }
    setHecho("Guardado.");
    onCambio(resultado.datos);
  };

  const escribir = async () => {
    if (!estimacionAsistente) return;
    setEscribiendo(true);
    setHecho(null);
    // Qué se está confirmando: la idea, el precio y cuántas escenas. Al cambiar cualquiera de los tres, la
    // confirmación es otra y la clave se renueva.
    const firma = `${idea.trim()}|${estimacionAsistente.sello}|${estimacionAsistente.creditos}|${ESCENAS_SUGERIDAS[proyecto.formato]}`;
    clave.current = claveEstable(clave.current, firma);
    const resultado = await pedirGuion(proyecto.id, {
      claveIdempotencia: clave.current.valor,
      creditosConfirmados: estimacionAsistente.creditos,
      selloEstimacion: estimacionAsistente.sello,
      escenas: ESCENAS_SUGERIDAS[proyecto.formato],
    });
    setEscribiendo(false);
    if (!resultado.ok) {
      onError(
        resultado.red
          ? `${resultado.error} Puede que el guion se haya encargado: recarga la página antes de repetir.`
          : resultado.error,
      );
      return;
    }
    setConcepto(resultado.datos.proyecto.concepto);
    setHecho("El asistente ha propuesto un guion. Revísalo escena a escena antes de aprobar el plan.");
    onCambio(resultado.datos);
  };

  return (
    <Paso numero={1} titulo="La idea">
      <div className="flex flex-col gap-4">
        {hecho && <Aviso tono="correcto">{hecho}</Aviso>}

        <Campo etiqueta="Idea" ayuda="En tus palabras. Es lo único que el asistente recibe, junto con el formato.">
          {(p) => <AreaTexto {...p} value={idea} maxLength={IDEA_MAXIMA} onChange={(e) => setIdea(e.target.value)} />}
        </Campo>

        <SelectorPersonaje
          personajes={personajes}
          valor={proyecto.personajeId}
          onCambio={(id) => guardar({ personajeId: id })}
          deshabilitado={guardando}
        />

        <Campo
          etiqueta="Concepto"
          ayuda="El resumen del vídeo. Lo propone el asistente y lo puedes reescribir; también puedes escribirlo tú desde cero."
        >
          {(p) => (
            <AreaTexto
              {...p}
              value={concepto}
              maxLength={CONCEPTO_MAXIMO}
              onChange={(e) => setConcepto(e.target.value)}
            />
          )}
        </Campo>

        <div className="flex flex-wrap gap-3">
          <Boton variante="secundario" disabled={guardando} onClick={() => guardar({ idea, concepto })}>
            {guardando ? "Guardando…" : "Guardar idea y concepto"}
          </Boton>
        </div>

        {/* Zona de claridad del gasto: neutra, sin degradados ni movimiento. */}
        <div className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-4">
          <h3 className="font-bold text-texto">Asistente de guion</h3>
          {detalle.asistenteDisponible && estimacionAsistente ? (
            <>
              <p className="text-texto-suave">
                Propone un concepto y un guion por escenas a partir de tu idea. Lo que escribe es una{" "}
                <strong className="text-texto">propuesta</strong>: sustituye las escenas en borrador y no aprueba ni
                genera nada. Lo revisas tú.
              </p>
              <p className="font-mono text-texto">
                {formatearCreditos(estimacionAsistente.creditos)} (estimación, precio del{" "}
                {formatearFecha(estimacionAsistente.comprobado)}) ≈ {formatearEuros(estimacionAsistente.euros)} ·{" "}
                {estimacionAsistente.nombreModelo}
              </p>
              <p className="text-sm text-texto-suave">
                Se paga con tu propia clave del proveedor. El importe final lo informa él al terminar.
              </p>
              <div>
                <Boton variante="chispa" onClick={escribir} disabled={escribiendo || idea.trim() === ""}>
                  <Sparkles className="size-5" aria-hidden />
                  {escribiendo ? "Escribiendo…" : "Escribir el guion con el asistente"}
                </Boton>
              </div>
            </>
          ) : (
            <p className="text-texto-suave">{detalle.motivoAsistente}</p>
          )}
        </div>
      </div>
    </Paso>
  );
}
