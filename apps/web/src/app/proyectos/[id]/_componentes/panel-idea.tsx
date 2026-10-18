"use client";

import { Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { Boton } from "@/components/ui/button";
import { CargadorChispa } from "@/components/ui/chispa";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo } from "@/components/ui/field";
import { SelectorPlataforma } from "@/components/ui/formatos";
import { LimiteDeCarga } from "@/components/ui/limite-de-carga";
import { Dialogo } from "@/components/ui/overlay";
import { Paso } from "@/components/ui/paso";
import { SelectorPersonaje } from "@/components/ui/personaje";
import { Selector } from "@/components/ui/select";
import { type EleccionVideoCompleto, motivoDeLaEleccion, SelectorVideoCompleto } from "@/components/ui/video-completo";
import { type ClaveConfirmacion, claveEstable } from "@/lib/asistente";
import { ACENTOS, type Acento, AYUDA_ACENTO, NOMBRE_ACENTO } from "@/lib/direccion";
import { formatoPrincipal } from "@/lib/formatos";
import { formatearCreditos, formatearEuros } from "@/lib/generacion";
import type { PersonajeElegible } from "@/lib/personajes";
import { DURACIONES_DISPONIBLES } from "@/lib/produccion";
import { CONCEPTO_MAXIMO, ESCENAS_SUGERIDAS, formatearFecha, IDEA_MAXIMA, type ProyectoDetalle } from "@/lib/proyectos";
import { costeDelGuion } from "@/lib/video-completo";
import { editarProyecto, pedirGuion } from "../../_componentes/api-proyectos";

/** El selector del lugar del proyecto se descarga aparte: la página del proyecto va justa de JavaScript. */
const LugarDelProyecto = dynamic(
  () => import("@/components/ui/lugares/lugar-del-proyecto").then((m) => m.LugarDelProyecto),
  { loading: () => <CargadorChispa etiqueta="Cargando tus lugares" /> },
);

/**
 * Opciones de duración del clip con precio medido. El coste depende del modelo elegido. Un vídeo completo puede
 * dejar el proyecto en 10 s, que no se elige aquí pero se enseña tal cual para no mentir sobre lo que hay.
 */
const opcionesDuracion = (actual: number) =>
  [...new Set([...DURACIONES_DISPONIBLES, actual])].map((segundos) => ({
    value: String(segundos),
    label: `${segundos} segundos`,
  }));

/**
 * Idea, protagonista, duración del clip y concepto, con el asistente al lado.
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
  const [segundos, setSegundos] = useState(proyecto.segundosClip);
  const [concepto, setConcepto] = useState(proyecto.concepto);
  const [acento, setAcento] = useState<Acento>(proyecto.acento);
  /**
   * Lo que hay que confirmar antes de cambiar el acento: el servidor dice **cuántas escenas pierde** y no se
   * cambia nada hasta que el usuario lo acepta. Es el mismo trato que la voz del proyecto.
   */
  const [acentoPorConfirmar, setAcentoPorConfirmar] = useState<{ acento: Acento; motivo: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [escribiendo, setEscribiendo] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);
  /** El guion lo escribió una reserva de pago: se dice quién y cuánto costó, aparte del «hecho». */
  const [avisoReserva, setAvisoReserva] = useState<string | null>(null);
  /**
   * Clave de la confirmación, **estable mientras no cambie lo que se confirma** (mismo patrón que
   * `panel-generar.tsx`). Si se generara una nueva en cada clic, un doble clic o un reintento tras un error de
   * red pedirían **dos** guiones y se cobrarían los dos: la idempotencia del servidor solo protege si la clave
   * es la misma.
   */
  const clave = useRef<ClaveConfirmacion | null>(null);
  /** Vídeo completo: duración, tipo y segundo personaje. Sin duración, escenas sueltas como hasta ahora. */
  const [video, setVideo] = useState<EleccionVideoCompleto>({
    duracion: null,
    tipo: "una_persona",
    segundoPersonajeId: null,
  });
  const motivoVideo = detalle.videoCompleto ? motivoDeLaEleccion(detalle.videoCompleto, video) : null;
  const creditosAConfirmar =
    estimacionAsistente && video.duracion !== null
      ? costeDelGuion(estimacionAsistente.creditos, video.duracion, video.tipo).total
      : (estimacionAsistente?.creditos ?? 0);

  /** `true` si se ha guardado; si no, ya ha avisado del error y quien llama deshace lo que mostró por adelantado. */
  const guardar = async (cambios: Record<string, unknown>): Promise<boolean> => {
    setGuardando(true);
    const resultado = await editarProyecto(proyecto.id, cambios);
    setGuardando(false);
    if (!resultado.ok) {
      onError(resultado.error);
      return false;
    }
    setHecho("Guardado.");
    onCambio(resultado.datos);
    return true;
  };

  const escribir = async () => {
    if (!estimacionAsistente) return;
    setEscribiendo(true);
    setHecho(null);
    setAvisoReserva(null);
    // Qué se está confirmando: la idea, el precio, cuántas escenas y, en un vídeo completo, su duración, su tipo y
    // con quién. Al cambiar cualquiera, la confirmación es otra y la clave se renueva.
    const firma = `${idea.trim()}|${estimacionAsistente.sello}|${creditosAConfirmar}|${ESCENAS_SUGERIDAS[proyecto.formato]}|${video.duracion ?? ""}|${video.tipo}|${video.segundoPersonajeId ?? ""}`;
    clave.current = claveEstable(clave.current, firma);
    const resultado = await pedirGuion(proyecto.id, {
      claveIdempotencia: clave.current.valor,
      creditosConfirmados: creditosAConfirmar,
      selloEstimacion: estimacionAsistente.sello,
      escenas: ESCENAS_SUGERIDAS[proyecto.formato],
      ...(video.duracion === null
        ? {}
        : {
            duracion: video.duracion,
            tipo: video.tipo,
            ...(video.segundoPersonajeId ? { segundoPersonajeId: video.segundoPersonajeId } : {}),
          }),
    });
    setEscribiendo(false);
    if (!resultado.ok) {
      // El servidor ha respondido con un error: no queda nada en marcha con esta clave, así que el siguiente intento
      // es una confirmación nueva. Con un error de red no se sabe, y se conserva para no pagar dos veces.
      if (!resultado.red) clave.current = null;
      onError(
        resultado.red
          ? `${resultado.error} Puede que el guion se haya encargado: recarga la página antes de repetir.`
          : resultado.error,
      );
      return;
    }
    setConcepto(resultado.datos.proyecto.concepto);
    setHecho(
      video.duracion === null
        ? "El asistente ha propuesto un guion. Revísalo escena a escena antes de aprobar el plan."
        : "El asistente ha escrito el guion completo, con el diálogo de cada clip. Puedes verlo y editarlo en las escenas y en su reparto antes de aprobar el plan.",
    );
    setAvisoReserva(resultado.datos.avisoReserva ?? null);
    onCambio(resultado.datos);
  };

  /**
   * Cambia el acento. Primero se intenta sin confirmar: si el servidor dice que hay escenas que perderían su
   * voz o su clip, responde 409 con la cuenta exacta y **no cambia nada**. Entonces se le enseña al usuario ese
   * mismo motivo y se vuelve a pedir con su confirmación. Nunca se inventa aquí cuántas escenas son.
   */
  const cambiarAcento = async (elegido: Acento, confirmado = false): Promise<void> => {
    const anterior = acento;
    setAcento(elegido);
    setGuardando(true);
    const resultado = await editarProyecto(proyecto.id, {
      acento: elegido,
      ...(confirmado ? { confirmarInvalidacion: true } : {}),
    });
    setGuardando(false);
    if (resultado.ok) {
      setAcentoPorConfirmar(null);
      setHecho("Guardado.");
      onCambio(resultado.datos);
      return;
    }
    setAcento(anterior);
    if (!confirmado) {
      setAcentoPorConfirmar({ acento: elegido, motivo: resultado.error });
      return;
    }
    setAcentoPorConfirmar(null);
    onError(resultado.error);
  };

  return (
    <Paso numero={2} titulo="La idea">
      <div className="flex flex-col gap-4">
        {hecho && <Aviso tono="correcto">{hecho}</Aviso>}
        {avisoReserva && <Aviso tono="aviso">{avisoReserva}</Aviso>}

        <Campo etiqueta="Idea" ayuda="En tus palabras. Es lo único que el asistente recibe, junto con el formato.">
          {(p) => <AreaTexto {...p} value={idea} maxLength={IDEA_MAXIMA} onChange={(e) => setIdea(e.target.value)} />}
        </Campo>

        <SelectorPersonaje
          personajes={personajes}
          valor={proyecto.personajeId}
          onCambio={(id) => guardar({ personajeId: id })}
          deshabilitado={guardando}
        />
        {proyecto.estiloVisual === "animado" && (
          <Aviso tono="info">
            Proyecto animado: las escenas y los planos de apoyo heredan la guía visual del protagonista. Sus clips deben
            conservar el diseño del retrato maestro aprobado.
          </Aviso>
        )}

        <LimiteDeCarga>
          <LugarDelProyecto
            valor={proyecto.lugarId ?? null}
            acabado={proyecto.estiloVisual}
            deshabilitado={guardando}
            onCambio={(lugarId) => void guardar({ lugarId })}
          />
        </LimiteDeCarga>

        <div className="flex flex-col gap-2">
          <Selector
            etiqueta="Duración de cada clip"
            opciones={opcionesDuracion(segundos)}
            valor={String(segundos)}
            deshabilitado={guardando}
            onCambio={(v) => {
              if (!v) return;
              const elegidos = Number(v);
              const anteriores = segundos;
              setSegundos(elegidos);
              void guardar({ segundosClip: elegidos }).then((ok) => {
                if (!ok) setSegundos(anteriores);
              });
            }}
          />
          <p className="text-sm text-texto-suave">
            Es lo que dura cada escena del vídeo, y el asistente propone escenas de esa duración. Cada duración tiene su
            precio: revisa el coste en el plan antes de producir. Si el modelo de vídeo no admite la duración elegida,
            el plan lo dice y la puedes cambiar aquí o cambiar de modelo en las Opciones avanzadas.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <SelectorPlataforma
            etiqueta="¿Para qué es? Los clips se generan en este formato"
            valor={formatoPrincipal(proyecto.formatos ?? [])}
            motivos={detalle.formatosGenerables}
            deshabilitado={guardando || proyecto.estado !== "borrador"}
            onCambio={(nuevo) =>
              void guardar({ formatos: [nuevo, ...(proyecto.formatos ?? []).filter((f) => f !== nuevo)] })
            }
          />
          <p className="text-sm text-texto-suave">
            {proyecto.estado === "borrador"
              ? "Los demás formatos se sacan en el montaje, del mismo clip y sin coste."
              : "Con el plan aprobado ya no se cambia: las escenas se aprobaron para este formato. Los demás se sacan en el montaje, del mismo clip y sin coste."}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Selector
            etiqueta="Acento del habla"
            opciones={ACENTOS.map((a) => ({ value: a, label: NOMBRE_ACENTO[a] }))}
            valor={acento}
            deshabilitado={guardando}
            onCambio={(v) => {
              if (!v) return;
              void cambiarAcento(v as Acento);
            }}
          />
          <p className="text-sm text-texto-suave">
            {AYUDA_ACENTO} Es del proyecto entero: si cada escena eligiera el suyo, el acento cambiaría de plano a
            plano.
          </p>
        </div>

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
              {detalle.videoCompleto && (
                <SelectorVideoCompleto
                  condiciones={detalle.videoCompleto}
                  eleccion={video}
                  personajes={personajes}
                  protagonistaId={proyecto.personajeId}
                  precio={estimacionAsistente}
                  deshabilitado={escribiendo}
                  onCambio={setVideo}
                />
              )}
              {video.duracion === null && (
                <p className="font-mono text-texto">
                  {formatearCreditos(estimacionAsistente.creditos)} (estimación, precio del{" "}
                  {formatearFecha(estimacionAsistente.comprobado)}) ≈ {formatearEuros(estimacionAsistente.euros)}
                </p>
              )}
              <p className="text-sm text-texto-suave">
                Se paga con tu propia clave del proveedor. El importe final lo informa él al terminar.
              </p>
              <div>
                {motivoVideo && <p className="mb-2 text-sm text-texto-suave">{motivoVideo}</p>}
                <Boton
                  variante="chispa"
                  onClick={escribir}
                  disabled={escribiendo || idea.trim() === "" || motivoVideo !== null}
                >
                  <Sparkles className="size-5" aria-hidden />
                  {escribiendo
                    ? "Escribiendo…"
                    : video.duracion === null
                      ? "Escribir el guion con el asistente"
                      : "Escribir el guion completo"}
                </Boton>
              </div>
            </>
          ) : (
            <p className="text-texto-suave">{detalle.motivoAsistente}</p>
          )}
        </div>
      </div>

      <Dialogo
        abierto={acentoPorConfirmar !== null}
        onAbiertoCambio={(abierto) => {
          if (!abierto) setAcentoPorConfirmar(null);
        }}
        titulo="Cambiar el acento del proyecto"
        descripcion={acentoPorConfirmar?.motivo ?? ""}
        pie={
          <>
            <Boton variante="secundario" onClick={() => setAcentoPorConfirmar(null)}>
              Dejarlo como está
            </Boton>
            <Boton
              onClick={() => acentoPorConfirmar && void cambiarAcento(acentoPorConfirmar.acento, true)}
              disabled={guardando}
            >
              Cambiar el acento
            </Boton>
          </>
        }
      />
    </Paso>
  );
}
