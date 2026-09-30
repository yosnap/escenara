"use client";

import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Alerta } from "@/components/ui/alerta";
import { Boton, BotonIcono } from "@/components/ui/button";
import { InsigniaControl } from "@/components/ui/controles";
import { DemoDePlantilla } from "@/components/ui/demo-plantilla";
import { PanelDireccion } from "@/components/ui/direccion/panel-direccion";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo } from "@/components/ui/field";
import { MiniaturaMedio } from "@/components/ui/media/miniatura-medio";
import { Dialogo } from "@/components/ui/overlay";
import { InsigniaEstadoEscena } from "@/components/ui/proyecto";
import { Selector } from "@/components/ui/select";
import { ETIQUETA_ESTADO_CONTROL } from "@/lib/controles";
import type { Acento, OpcionesDeDireccion } from "@/lib/direccion";
import { type BorradorEscena, borradorDe, escenaConCambios } from "@/lib/escena-borrador";
import { cupoDeFotosDe } from "@/lib/fotos-del-producto";
import type { PersonajeElegible } from "@/lib/personajes";
import type { TrendPublico } from "@/lib/presets";
import {
  ACCION_MAXIMA,
  type EscenaVista,
  type ProyectoDetalle,
  TEXTO_ESCENA_MAXIMO,
  textoEstimacion,
} from "@/lib/proyectos";
import { motivoDuracionNoAdmitida } from "@/lib/trends";
import { borrarEscena, editarEscena } from "../../_componentes/api-proyectos";
import { PanelAfirmaciones } from "./panel-afirmaciones";
import { PanelCantoEscena } from "./panel-canto-escena";
import { PanelReparto } from "./reparto/panel-reparto";

/**
 * Una escena: lo que se cuenta y lo que se ve. Cuánto dura lo decide el proyecto entero, así que aquí solo se
 * recuerda: producir todas las escenas con la misma duración es lo que hace que el coste sea el estimado.
 *
 * El prompt lo compone **el servidor** con la plantilla, los presets y la ficha del personaje, y **no se le
 * muestra al usuario** (ADR-0022). Lo que se escribe aquí pasa por la misma limpieza anti-inyección en el
 * servidor: es contenido, nunca parámetros del proveedor.
 */
export function EditorEscena({
  escena,
  trends,
  acento,
  primera,
  ultima,
  ocupado,
  opcionesDireccion,
  personajes,
  onSubir,
  onBajar,
  onCambio,
  onError,
  onSinGuardar,
}: {
  escena: EscenaVista;
  trends: TrendPublico[];
  /** Acento del proyecto. Se enseña con la dirección para que se vea con qué va a hablar, pero se edita arriba. */
  acento: Acento;
  primera: boolean;
  ultima: boolean;
  ocupado: boolean;
  /** Catálogo de la dirección, ya leído por la pantalla. `null` mientras se está cargando. */
  opcionesDireccion: OpcionesDeDireccion | null;
  /** Personajes propios entre los que elegir el segundo del reparto (0.28.0). */
  personajes: readonly PersonajeElegible[];
  onSubir: () => void;
  onBajar: () => void;
  onCambio: (detalle: ProyectoDetalle) => void;
  onError: (mensaje: string) => void;
  /** Avisa de si esta escena tiene cambios sin guardar, para que la aprobación no apruebe otra cosa. */
  onSinGuardar?: (id: string, sinGuardar: boolean) => void;
}) {
  const [texto, setTexto] = useState(escena.texto);
  const [accion, setAccion] = useState(escena.accion);
  const [direccion, setDireccion] = useState(escena.direccion);
  const [producto, setProducto] = useState(escena.producto);
  const [trendId, setTrendId] = useState(escena.trendId ?? "");
  const trend = trends.find((p) => p.id === trendId);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const sinGuardar = escenaConCambios(escena, { texto, accion, direccion, producto, trendId });
  // Se avisa al cambiar y se retira al desmontar (una escena borrada ya no tiene nada pendiente).
  // biome-ignore lint/correctness/useExhaustiveDependencies: el aviso depende de si hay cambios, no de la función.
  useEffect(() => {
    onSinGuardar?.(escena.id, sinGuardar);
  }, [escena.id, sinGuardar]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al desmontar.
  useEffect(() => () => onSinGuardar?.(escena.id, false), [escena.id]);

  /** Vuelve el formulario a lo guardado (al descartar) o a lo que el servidor acaba de guardar. */
  const cargar = (b: BorradorEscena) => {
    setTexto(b.texto);
    setAccion(b.accion);
    setDireccion(b.direccion);
    setProducto(b.producto);
    setTrendId(b.trendId);
  };

  const guardar = async () => {
    setGuardando(true);
    const resultado = await editarEscena(escena.id, {
      texto,
      accion,
      ...direccion,
      producto,
      trendId: direccion.formatoClip === "cantar" ? null : trendId || null,
    });
    setGuardando(false);
    if (!resultado.ok) {
      onError(resultado.error);
      return;
    }
    // Lo guardado es la nueva referencia: si el servidor normaliza algo, el formulario no se queda «sin guardar».
    const guardada = resultado.datos.escenas.find((e) => e.id === escena.id);
    if (guardada) cargar(borradorDe(guardada));
    onCambio(resultado.datos);
  };

  const borrar = async () => {
    const resultado = await borrarEscena(escena.id);
    setBorrando(false);
    if (resultado.ok) onCambio(resultado.datos);
    else onError(resultado.error);
  };

  return (
    <article className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde/60 bg-superficie p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-degradado-escenario font-bold text-sobre-acento">
            {escena.orden}
          </span>
          {/*
            El storyboard muestra el fotograma **real** de la escena (0.19.0): el aprobado si hay uno y, si no, el
            último generado. En la 0.17.0 aquí no había miniatura y el storyboard era una lista de texto.
          */}
          {escena.fotograma && (
            <span className="block size-14 shrink-0 overflow-hidden rounded-control border border-borde">
              <MiniaturaMedio medio={escena.fotograma} />
            </span>
          )}
          <InsigniaEstadoEscena estado={escena.estado} />
          {/* Controles previos de la escena (0.18.0): color **y** icono **y** texto. */}
          <InsigniaControl estado={escena.controles.estado} breve />
        </div>
        <div className="flex items-center gap-1">
          <BotonIcono etiqueta="Subir la escena" onClick={onSubir} disabled={ocupado || primera}>
            <ChevronUp className="size-5" />
          </BotonIcono>
          <BotonIcono etiqueta="Bajar la escena" onClick={onBajar} disabled={ocupado || ultima}>
            <ChevronDown className="size-5" />
          </BotonIcono>
          <BotonIcono
            etiqueta="Borrar la escena"
            onClick={() => setBorrando(true)}
            disabled={ocupado || escena.estado === "producida"}
          >
            <Trash2 className="size-5" />
          </BotonIcono>
        </div>
      </header>

      {/*
        Por qué esta escena no se puede producir todavía, con la acción de cada freno. Sale del **mismo motor**
        que cierra la puerta al producirla, así que aquí no hay promesas: es lo que va a decir el servidor.
      */}
      {escena.controles.comprobaciones.length > 0 && (
        <Alerta
          tipo={
            escena.controles.comprobaciones.some((c) => c.estado === "bloqueado")
              ? "bloqueo"
              : escena.controles.comprobaciones.some((c) => c.estado === "ajustes")
                ? "aviso"
                : "info"
          }
          compacta
          anuncio="estado"
        >
          <ul className="flex flex-col gap-2">
            {escena.controles.comprobaciones.map((c) => (
              <li key={c.regla} className="text-texto">
                <span className="font-semibold">{ETIQUETA_ESTADO_CONTROL[c.estado]}: </span>
                <span>{c.motivo} </span>
                <span className="text-texto-suave">{c.accion}</span>
              </li>
            ))}
          </ul>
        </Alerta>
      )}

      <Campo
        etiqueta="Lo que se cuenta o se dice"
        ayuda={
          direccion.formatoClip === "cantar"
            ? "En canto, el clip dura lo que dure el audio elegido y el coste se calcula con sus segundos facturables."
            : `Esta escena durará ${escena.segundos} s: la duración se elige una vez para todo el proyecto.`
        }
      >
        {(p) => (
          <AreaTexto {...p} value={texto} maxLength={TEXTO_ESCENA_MAXIMO} onChange={(e) => setTexto(e.target.value)} />
        )}
      </Campo>

      <Campo etiqueta="Lo que se ve (encuadre y acción)" ayuda="Es la base del fotograma del storyboard.">
        {(p) => (
          <AreaTexto {...p} value={accion} maxLength={ACCION_MAXIMA} onChange={(e) => setAccion(e.target.value)} />
        )}
      </Campo>

      {/*
        El acento no se elige aquí: es del proyecto entero y está en su cabecera. Ofrecerlo por escena haría
        creer que puede cambiar de plano a plano, que es justo lo que no puede.
      */}
      <PanelDireccion
        direccion={{ ...direccion, acento }}
        opciones={opcionesDireccion}
        guion={texto}
        segundos={escena.segundos}
        producto={producto}
        onProducto={setProducto}
        // Una escena cantada no lleva producto en el clip: el aviso no aplica.
        fotoDeProducto={direccion.formatoClip === "cantar" ? null : (escena.estimacion?.fotoDeProducto ?? null)}
        elegirFotosDelProducto={
          direccion.formatoClip === "cantar" ? null : cupoDeFotosDe(escena.estimacion?.fotoDeProducto)
        }
        trend={
          trend && direccion.formatoClip !== "cantar"
            ? { nombre: trend.nombre, decide: trend.direccionDecidida, permiteHabla: trend.permiteHabla }
            : null
        }
        deshabilitado={ocupado || escena.estado === "producida"}
        onCambio={(campo, valor) => {
          if (campo === "acento") return;
          if (campo === "formatoClip" && valor === "cantar") setTrendId("");
          setDireccion((antes) => ({ ...antes, [campo]: valor }));
        }}
      />

      {direccion.formatoClip === "cantar" &&
        (escena.direccion.formatoClip === "cantar" ? (
          <PanelCantoEscena
            key={escena.id}
            escenaId={escena.id}
            proyectoId={escena.proyectoId}
            onProyectoCambio={onCambio}
          />
        ) : (
          <p className="text-sm text-texto-suave">Guarda la escena para elegir el audio y declarar sus derechos.</p>
        ))}
      {direccion.formatoClip !== "cantar" && (
        <section className="flex flex-col gap-3 rounded-tarjeta bg-elevada p-4">
          <h3 className="font-bold text-texto">Trend del clip</h3>
          <Selector
            etiqueta="Formato vigente"
            valor={trendId}
            marcador="Sin trend"
            opciones={[
              { value: "", label: "Sin trend" },
              ...trends.map((p) => {
                // Sin duraciones admitidas vale con la del proyecto; con ellas, solo si la del proyecto está entre ellas.
                const motivo = motivoDuracionNoAdmitida(
                  { nombre: p.nombre, duracionesAdmitidas: p.duracionesAdmitidas },
                  escena.segundos,
                  "proyecto",
                );
                return {
                  value: p.id,
                  label: p.nombre,
                  descripcion: motivo ?? (p.demo ? `${p.descripcion} · Con ejemplo` : p.descripcion),
                  ...(motivo ? { deshabilitada: true } : {}),
                };
              }),
            ]}
            onCambio={(valor) => {
              setTrendId(valor ?? "");
              // Con un trend no hay modo experto: su texto ya describe el clip, y el servidor lo rechazaría.
              if (valor) setDireccion((antes) => ({ ...antes, modoExperto: false }));
            }}
            deshabilitado={ocupado || escena.estado === "producida"}
          />
          {trend && (
            <Aviso tono="info">
              Vista previa: {trend.vistaPrevia.resumen}. {trend.vistaPrevia.duracion};{" "}
              {trend.vistaPrevia.habla.toLowerCase()}. Coste previsto de esta escena:{" "}
              {escena.estimacion
                ? textoEstimacion(escena.estimacion.creditos, escena.estimacion.euros, escena.estimacion.comprobado)
                : "sin tarifa registrada"}
              . La cifra se confirma en el plan antes de generar.
            </Aviso>
          )}
          {trend?.demo && <DemoDePlantilla demo={trend.demo} titulo={`Ejemplo de «${trend.nombre}»`} />}
          {trend && trendId === escena.trendId && escena.trendVersion !== trend.version && (
            <Alerta tipo="bloqueo" compacta anuncio="estado">
              Este trend tiene una versión nueva (v{trend.version}) desde que lo elegiste (v{escena.trendVersion ?? "?"}
              ): puede cambiar la duración que admite o lo que decide de la dirección. Revisa la dirección y pulsa
              «Guardar escena» para usarla; hasta entonces esta escena no se puede producir.
            </Alerta>
          )}
          {trendId && !trend && (
            <Aviso tono="error">
              Este trend ya no está vigente. Elige uno de los disponibles o quítalo y guarda la escena.
            </Aviso>
          )}
          {trends.length === 0 && (
            <p className="text-sm text-texto-suave">Todavía no hay trends aprobados por la administración.</p>
          )}
        </section>
      )}

      {/*
        Con qué referencia se generó: es parte de saber qué se ha pagado, sobre todo con la prueba de la hoja
        activada, donde la mitad de las escenas salen solo con ella.
      */}
      {escena.referenciaIdentidad && (
        <p className="text-sm text-texto-suave">
          Se generó con:{" "}
          <strong className="font-semibold">
            {escena.referenciaIdentidad === "hoja_3x3" ? "la hoja de identidad 3×3" : "las fotos del personaje"}
          </strong>
          .
        </p>
      )}

      <p className="text-sm text-texto-suave">
        El texto que se le envía al modelo lo compone Escenara con tu escena, la plantilla y la ficha de tu personaje, y
        va en inglés porque responden mejor. Tú decides el qué.
      </p>

      {/*
        Quién sale en esta escena y qué dice cada uno (0.28.0). Va debajo de la dirección porque el reparto es lo
        último que se decide de un plano y lo primero que cambia lo que cuesta: dos personajes en podcast son dos
        clips. Una escena de un personaje se comporta exactamente como antes de esta versión.
      */}
      <PanelReparto
        escenaId={escena.id}
        personajes={personajes}
        deshabilitado={ocupado || escena.estado === "producida"}
        onError={onError}
      />

      <PanelAfirmaciones afirmaciones={escena.afirmaciones} onCambio={onCambio} onError={onError} />

      <footer className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-sm text-texto-suave">
          {escena.estimacion
            ? textoEstimacion(escena.estimacion.creditos, escena.estimacion.euros, escena.estimacion.comprobado)
            : "Sin precio registrado: esta escena no se puede estimar."}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {sinGuardar && <span className="text-sm font-semibold text-texto">Cambios sin guardar</span>}
          {sinGuardar && (
            <Boton variante="fantasma" onClick={() => cargar(borradorDe(escena))} disabled={guardando || ocupado}>
              Descartar cambios
            </Boton>
          )}
          <Boton variante="secundario" onClick={guardar} disabled={guardando || ocupado}>
            {guardando ? "Guardando…" : "Guardar escena"}
          </Boton>
        </div>
      </footer>

      <Dialogo
        abierto={borrando}
        onAbiertoCambio={setBorrando}
        titulo={`¿Borrar la escena ${escena.orden}?`}
        descripcion="Se borra su texto y sus afirmaciones señaladas. Las escenas siguientes se renumeran."
        pie={
          <>
            <Boton variante="secundario" onClick={() => setBorrando(false)}>
              Cancelar
            </Boton>
            <Boton variante="peligro" onClick={borrar}>
              Borrar la escena
            </Boton>
          </>
        }
      />
    </article>
  );
}
