"use client";

import { Clapperboard, Frame, ImagePlus, Lock, Move3d, PenLine, Timer, Video } from "lucide-react";
import { useId } from "react";
import {
  ACENTOS,
  AVISO_MODO_EXPERTO,
  AVISO_MOVIMIENTO_AVANZADO,
  AYUDA_ACENTO,
  AYUDA_INSTRUCCIONES_EXTRA,
  AYUDA_MODO_EXPERTO,
  avisoGestoNoCabe,
  DESCRIPCION_EXPERTA_MAXIMA,
  DESCRIPCION_FORMATO_CLIP,
  DESCRIPCION_REGISTRO_ESTETICO,
  type DireccionElegidaConAcento,
  FORMATOS_CLIP,
  formatoCanta,
  formatoHabla,
  gestoNoCabe,
  INSTRUCCIONES_EXTRA_MAXIMAS,
  MOMENTOS_MICROACCION,
  NOMBRE_ACENTO,
  NOMBRE_FORMATO_CLIP,
  NOMBRE_MOMENTO_MICROACCION,
  NOMBRE_NIVEL_CAMARA,
  NOMBRE_REGISTRO_ESTETICO,
  type OpcionDireccion,
  type OpcionesDeDireccion,
  REGISTROS_ESTETICOS,
} from "@/lib/direccion";
import type { FotoDeProductoDelClip } from "@/lib/foto-de-producto";
import type { CupoDeFotos } from "@/lib/fotos-del-producto";
import type { ProductoElegido } from "@/lib/productos";
import { DIRECCION_VOCAL_MAXIMA } from "@/lib/proyectos";
import { type CategoriaDecidible, sinExpertoConTrend } from "@/lib/trends";
import { Alerta } from "../alerta";
import { Casilla } from "../choice";
import { Aviso } from "../feedback";
import { AreaTexto, Campo, EntradaTexto } from "../field";
import { SelectorProducto } from "../productos/selector-producto";
import { Selector } from "../select";
import { CabeceraGrupo } from "./cabecera-grupo";
import { DecididoPorTrend, type TrendDeLaDireccion } from "./decidido-por-trend";
import { DireccionesGuardadas } from "./direcciones-guardadas";
import { ElectorVisual, type OpcionVisual } from "./elector-visual";
import {
  type CategoriaPictograma,
  DefinicionesPictograma,
  fraseDeMomento,
  fraseDeOpcion,
  LineaDeTiempoGesto,
  Pictograma,
} from "./pictogramas";

/**
 * **Panel de dirección de un clip** (0.25.0, ampliado en 0.25.1). Lo usan los **dos** sitios donde se dirige:
 * la escena de un proyecto y el paso del clip de «Crear». Un solo componente, porque dirigir significa lo mismo
 * en los dos y tenerlo dos veces los habría separado.
 *
 * Reglas que se ven en la pantalla:
 *
 * - **no se enseña el prompt**, ni entero ni a trozos (ADR-0022). Lo que se enseña es el resumen en castellano
 *   de lo que ha pedido, que es lo que puede reconocer en el clip;
 * - **la toma única no es una opción**: se dice que va siempre, y no hay forma de quitarla;
 * - **no elegir también es elegir**: sin movimiento, la cámara se queda quieta, y así se le pide al modelo;
 * - **plano, ángulo, movimiento y momento del gesto llevan pictograma y una frase llana**: son palabras de
 *   oficio, y un dibujo dice en un segundo lo que un nombre no dice nunca;
 * - el **modo experto** apaga los botones, no los esconde: se sigue viendo lo que quedaría sin efecto;
 * - con un **trend** elegido, lo que decide su texto no se pregunta: sus controles se sustituyen por un bloque con el
 *   motivo escrito («Lo decide el trend «X»»), sin voz si el trend no deja hablar y sin modo experto.
 *
 * Todos los desplegables son el `Selector` del catálogo: aquí no hay ningún `<select>` nativo.
 */

/**
 * Los campos que se ponen al aplicar una dirección guardada, uno a uno por el mismo `onCambio` que usan los
 * botones. Quien dirige una escena ignora el acento (es del proyecto entero), y así no hace falta un segundo
 * camino para escribirlo.
 */
const CAMPOS_DE_LA_DIRECCION = [
  "formatoClip",
  "plano",
  "angulo",
  "camara",
  "microaccion",
  "momentoMicroaccion",
  "direccionVocal",
  "optica",
  "luz",
  "localizacion",
  "registroEstetico",
  "instruccionesExtra",
  "modoExperto",
  "descripcionExperta",
  "acento",
] as const satisfies readonly (keyof DireccionElegidaConAcento)[];

/** Opción vacía: el catálogo no obliga a elegir, y «sin elegir» tiene un significado distinto en cada campo. */
const SIN_ELEGIR = "";

const opcionesDe = (lista: OpcionDireccion[], vacio: string) => [
  { value: SIN_ELEGIR, label: vacio },
  ...lista.map((o) => ({ value: o.clave, label: o.nombre, descripcion: o.descripcion })),
];

/** Convierte las opciones del catálogo en tarjetas con pictograma, con la de «sin elegir» delante. */
const tarjetasDe = (
  categoria: CategoriaPictograma,
  lista: OpcionDireccion[],
  vacio: { nombre: string; frase: string },
): OpcionVisual[] => [
  {
    valor: SIN_ELEGIR,
    nombre: vacio.nombre,
    frase: vacio.frase,
    pictograma: <Pictograma categoria={categoria} clave="__sin-elegir" />,
  },
  ...lista.map((o) => ({
    valor: o.clave,
    nombre: o.nombre,
    frase: fraseDeOpcion(categoria, o.clave),
    descripcion: o.descripcion,
    pictograma: <Pictograma categoria={categoria} clave={o.clave} />,
    ...(o.nivel && o.nivel !== "basico" ? { etiqueta: NOMBRE_NIVEL_CAMARA[o.nivel] } : {}),
  })),
];

export function PanelDireccion({
  direccion,
  opciones,
  guion,
  segundos,
  conAcento,
  conFotograma = true,
  producto,
  onProducto,
  fotoDeProducto,
  elegirFotosDelProducto,
  trend = null,
  deshabilitado,
  onCambio,
}: {
  /** Lo elegido. El acento solo se edita aquí cuando no hay proyecto que lo fije (`conAcento`). */
  direccion: DireccionElegidaConAcento;
  opciones: OpcionesDeDireccion | null;
  /** El guion de la escena: con él se sabe si el gesto va a caber fuera del habla. */
  guion: string;
  /** Duración planificada. El servidor repite el cálculo con la duración ya resuelta, que es la que manda. */
  segundos: number;
  /**
   * `true` en «Crear», donde el acento se elige con el clip. En un proyecto va en su cabecera: es del proyecto
   * entero, y ofrecerlo por escena haría creer que el acento puede cambiar de plano a plano.
   */
  conAcento?: boolean;
  /**
   * `true` donde **esta pantalla dirige también el fotograma** del que sale el clip: la escena de un proyecto,
   * que lo genera con sus 6C. En «Crear» va en `false` y el bloque del fotograma no se enseña:
   *
   * - con una imagen de tu biblioteca no se genera ningún fotograma, así que la óptica, la luz y el sitio no
   *   describen nada que vaya a existir;
   * - con un fotograma nuevo, esos campos se eligen en su propio paso, y repetirlos aquí sería pedir lo mismo
   *   dos veces con dos respuestas posibles.
   *
   * El registro estético no se va con ellos: modula la cámara del **clip** y sí llega a su prompt, así que se
   * queda arriba, con el resto de la dirección del clip.
   */
  conFotograma?: boolean;
  /**
   * **El producto del clip** (0.26.0) y qué se hace con él. Viaja aparte de la dirección porque no es lo mismo:
   * la dirección son claves de catálogo que valen en cualquier proyecto, y un producto es una fila del usuario.
   *
   * Se enseña aquí, y solo aquí, porque los dos sitios que dirigen un clip usan este panel: así el producto se
   * elige junto a la cámara y el gesto, sin duplicar controles. `undefined` en las pantallas que todavía no lo
   * ofrecen, y entonces el bloque no aparece.
   */
  producto?: ProductoElegido;
  onProducto?: (elegido: ProductoElegido) => void;
  /** Si el modelo del clip admite la foto del producto: el aviso sale junto al selector de producto. */
  fotoDeProducto?: FotoDeProductoDelClip | null;
  /** Con qué se produce el clip: con ello, el selector deja elegir qué fotos del producto viajan. */
  elegirFotosDelProducto?: CupoDeFotos | null;
  /**
   * El trend elegido, si lo hay. Lo que decide se enseña bloqueado con su motivo y no se pregunta; si no deja hablar,
   * no se pide la voz; y no hay modo experto, porque su texto ya describe el clip. El servidor aplica la misma regla.
   */
  trend?: TrendDeLaDireccion | null;
  deshabilitado?: boolean;
  onCambio: <C extends keyof DireccionElegidaConAcento>(campo: C, valor: DireccionElegidaConAcento[C]) => void;
}) {
  const idSinExperto = useId();
  if (!opciones) return null;
  const libre = (categoria: CategoriaDecidible) => !trend?.decide.includes(categoria);
  const habla = formatoHabla(direccion.formatoClip) && (trend?.permiteHabla ?? true);
  const canta = formatoCanta(direccion.formatoClip);
  // Lo que decide el trend no cuenta como elegido: ni se avisa de ello ni sale en el resumen.
  const camaraElegida = libre("camara") ? opciones.camara.find((o) => o.clave === direccion.camara) : undefined;
  const gestoElegido = libre("microaccion")
    ? opciones.microaccion.find((o) => o.clave === direccion.microaccion)
    : undefined;
  // En modo experto los botones de encuadre y gesto **no se aplican**: se dejan a la vista y apagados, que es lo
  // honesto. El acento y la voz siguen siendo suyos: describen quién habla, no lo que se ve. Con un trend no hay modo
  // experto: el servidor lo rechaza, así que tampoco se enseña como activo.
  const experto = direccion.modoExperto && !trend;
  const botonesApagados = deshabilitado || experto;

  /**
   * Los mismos avisos que compone el servidor, calculados aquí con las **mismas funciones puras**: así el
   * usuario los ve mientras elige y no al recibir el clip. El que cuesta dinero —guion en clip mudo— no está
   * aquí: ese es un control confirmable y se pide antes de pagar, no se cuenta de pasada.
   */
  const palabras = guion.trim() === "" ? 0 : guion.trim().split(/\s+/).length;
  const avisos = experto
    ? []
    : [
        camaraElegida?.nivel === "avanzado" ? AVISO_MOVIMIENTO_AVANZADO : "",
        !canta && gestoElegido && direccion.momentoMicroaccion !== "durante" && gestoNoCabe(palabras, segundos)
          ? avisoGestoNoCabe(segundos)
          : "",
      ].filter((aviso) => aviso !== "");

  /** Lo que ha pedido, escrito en castellano. No es el prompt: es su elección. */
  const nombreDe = (lista: OpcionDireccion[], clave: string) => lista.find((o) => o.clave === clave)?.nombre ?? "";
  const resumen = experto
    ? ["Descripción escrita por ti", NOMBRE_ACENTO[direccion.acento]]
    : [
        NOMBRE_FORMATO_CLIP[direccion.formatoClip],
        trend && trend.decide.length > 0 ? `lo que decide el trend «${trend.nombre}»` : "",
        libre("plano") ? nombreDe(opciones.plano, direccion.plano) : "",
        libre("angulo") ? nombreDe(opciones.angulo, direccion.angulo) : "",
        libre("camara") ? (camaraElegida?.nombre ?? "cámara quieta") : "",
        gestoElegido
          ? `${gestoElegido.nombre} (${NOMBRE_MOMENTO_MICROACCION[direccion.momentoMicroaccion].toLowerCase()})`
          : "",
        direccion.instruccionesExtra.trim() === "" ? "" : "y lo que has añadido por escrito",
        canta ? "sincronía con tu audio" : habla ? "" : "sin voz",
      ].filter((parte) => parte !== "");

  return (
    <section className="flex flex-col gap-10 rounded-tarjeta border border-borde bg-elevada/40 p-5">
      <DefinicionesPictograma />
      <CabeceraGrupo
        icono={Clapperboard}
        titulo="Dirección del clip"
        descripcion="Cómo se ve y cómo se mueve el clip. Lo que dejes sin elegir lo decide el modelo."
        tono="direccion"
      />

      {/*
        Lo que has guardado con nombre. Aplicar una dirección rellena estos mismos controles y no genera nada:
        se sigue confirmando el coste como siempre.
      */}
      <DireccionesGuardadas
        direccion={direccion}
        opciones={opciones}
        deshabilitado={deshabilitado}
        onAplicar={(guardada) => {
          for (const campo of CAMPOS_DE_LA_DIRECCION) {
            onCambio(campo, guardada[campo] as DireccionElegidaConAcento[typeof campo]);
          }
        }}
      />

      <Selector
        etiqueta="Formato"
        valor={direccion.formatoClip}
        deshabilitado={deshabilitado}
        opciones={FORMATOS_CLIP.map((f) => ({
          value: f,
          label: NOMBRE_FORMATO_CLIP[f],
          descripcion: DESCRIPCION_FORMATO_CLIP[f],
        }))}
        onCambio={(v) => v && onCambio("formatoClip", v as DireccionElegidaConAcento["formatoClip"])}
      />

      {trend && <DecididoPorTrend trend={trend} />}

      {libre("plano") && (
        <ElectorVisual
          etiqueta="Plano"
          icono={Frame}
          ayuda="Cuánto se le ve en el encuadre."
          valor={direccion.plano}
          deshabilitado={botonesApagados}
          opciones={tarjetasDe("plano", opciones.plano, {
            nombre: "Sin elegir",
            frase: "Lo decide el modelo por lo que hayas escrito.",
          })}
          onCambio={(v) => onCambio("plano", v)}
        />
      )}

      {libre("angulo") && (
        <ElectorVisual
          etiqueta="Ángulo"
          icono={Move3d}
          ayuda="Desde dónde le mira la cámara."
          valor={direccion.angulo}
          deshabilitado={botonesApagados}
          opciones={tarjetasDe("angulo", opciones.angulo, {
            nombre: "Sin elegir",
            frase: "Lo decide el modelo por lo que hayas escrito.",
          })}
          onCambio={(v) => onCambio("angulo", v)}
        />
      )}

      {libre("camara") && (
        <ElectorVisual
          etiqueta="Movimiento de cámara"
          icono={Video}
          ayuda="Solo uno por clip: el modelo no respeta dos, y dos dejan el plano partido."
          valor={direccion.camara}
          deshabilitado={botonesApagados}
          opciones={tarjetasDe("camara", opciones.camara, {
            nombre: "Cámara quieta",
            frase: "No se mueve: se le pide expresamente que se quede fija.",
          })}
          onCambio={(v) => onCambio("camara", v)}
        />
      )}

      {libre("microaccion") && (
        <Selector
          etiqueta="Micro-acción"
          valor={direccion.microaccion}
          deshabilitado={botonesApagados}
          opciones={opcionesDe(opciones.microaccion, "Ninguna")}
          onCambio={(v) => {
            const clave = v ?? SIN_ELEGIR;
            onCambio("microaccion", clave);
            // Al elegir un gesto se propone el momento que trae el catálogo; el usuario puede cambiarlo.
            const propuesto = opciones.microaccion.find((o) => o.clave === clave)?.momento;
            if (propuesto) onCambio("momentoMicroaccion", propuesto);
          }}
        />
      )}
      {libre("microaccion") && direccion.microaccion !== SIN_ELEGIR && (
        <ElectorVisual
          etiqueta="Cuándo ocurre el gesto"
          icono={Timer}
          ayuda="La barra apagada es la frase; el tramo a color, el gesto."
          valor={direccion.momentoMicroaccion}
          deshabilitado={botonesApagados}
          opciones={MOMENTOS_MICROACCION.map((m) => ({
            valor: m,
            nombre: NOMBRE_MOMENTO_MICROACCION[m],
            frase: fraseDeMomento(m),
            pictograma: <LineaDeTiempoGesto momento={m} />,
          }))}
          onCambio={(v) => onCambio("momentoMicroaccion", v as DireccionElegidaConAcento["momentoMicroaccion"])}
        />
      )}

      {habla && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Cómo lo dice"
            ayuda="Un matiz corto de la voz: «en tono cercano», «con energía». El guion no se toca."
          >
            {(props) => (
              <EntradaTexto
                {...props}
                value={direccion.direccionVocal}
                maxLength={DIRECCION_VOCAL_MAXIMA}
                disabled={deshabilitado}
                onChange={(e) => onCambio("direccionVocal", e.target.value)}
              />
            )}
          </Campo>
          {/* El acento sigue siendo suyo en modo experto: describe quién habla, no lo que se ve. */}
          {conAcento && (
            <Selector
              etiqueta="Acento"
              valor={direccion.acento}
              deshabilitado={deshabilitado}
              opciones={ACENTOS.map((a) => ({ value: a, label: NOMBRE_ACENTO[a] }))}
              onCambio={(v) => v && onCambio("acento", v as DireccionElegidaConAcento["acento"])}
            />
          )}
        </div>
      )}
      {habla && conAcento && <p className="text-sm text-texto-suave">{AYUDA_ACENTO}</p>}

      {/* El registro estético es del clip: modula su cámara y su acabado, y por eso se elige con la cámara. */}
      {libre("registro-estetico") && (
        <Selector
          etiqueta="Registro estético"
          valor={direccion.registroEstetico}
          deshabilitado={botonesApagados}
          opciones={REGISTROS_ESTETICOS.map((r) => ({
            value: r,
            label: NOMBRE_REGISTRO_ESTETICO[r],
            descripcion: DESCRIPCION_REGISTRO_ESTETICO[r],
          }))}
          onCambio={(v) => v && onCambio("registroEstetico", v as DireccionElegidaConAcento["registroEstetico"])}
        />
      )}

      {/*
        El producto va con la dirección del clip y no en otra pantalla: qué se hace con él es lo mismo que
        elegir el gesto, y separarlo obligaría a describir dos veces la misma escena.
      */}
      {producto && onProducto && (
        <SelectorProducto
          producto={producto}
          acciones={opciones.accionProducto}
          fotoDeProducto={fotoDeProducto}
          elegirFotos={elegirFotosDelProducto}
          deshabilitado={botonesApagados}
          onCambio={onProducto}
        />
      )}

      {conFotograma && (
        <div className="flex flex-col gap-5">
          <CabeceraGrupo
            icono={ImagePlus}
            titulo="El fotograma"
            descripcion="La imagen de la que sale el clip: la óptica, la luz y el sitio."
            tono="detalle"
            nivel="grupo"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Selector
              etiqueta="Óptica"
              valor={direccion.optica}
              deshabilitado={botonesApagados}
              opciones={opcionesDe(opciones.optica, "Sin elegir")}
              onCambio={(v) => onCambio("optica", v ?? SIN_ELEGIR)}
            />
            <Selector
              etiqueta="Luz"
              valor={direccion.luz}
              deshabilitado={botonesApagados}
              opciones={opcionesDe(opciones.luz, "Sin elegir")}
              onCambio={(v) => onCambio("luz", v ?? SIN_ELEGIR)}
            />
            <Selector
              etiqueta="Sitio"
              valor={direccion.localizacion}
              deshabilitado={botonesApagados}
              opciones={opcionesDe(opciones.localizacion, "Sin elegir")}
              onCambio={(v) => onCambio("localizacion", v ?? SIN_ELEGIR)}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-5">
        <CabeceraGrupo
          icono={PenLine}
          titulo="Escríbelo tú"
          descripcion="Lo que no cabe en las opciones de arriba, con tus palabras."
          tono="detalle"
          nivel="grupo"
        />
        {!experto && (
          <Campo etiqueta="Instrucciones adicionales (en español)" ayuda={AYUDA_INSTRUCCIONES_EXTRA}>
            {(props) => (
              <AreaTexto
                {...props}
                value={direccion.instruccionesExtra}
                maxLength={INSTRUCCIONES_EXTRA_MAXIMAS}
                disabled={deshabilitado}
                className="min-h-20"
                onChange={(e) => onCambio("instruccionesExtra", e.target.value)}
                placeholder="Que sostenga el bote con la etiqueta hacia la cámara y que la luz entre por la izquierda."
              />
            )}
          </Campo>
        )}

        <Casilla
          etiqueta="Modo experto: escribo yo la descripción entera"
          descripcion={AYUDA_MODO_EXPERTO}
          marcada={experto}
          deshabilitado={deshabilitado || trend !== null}
          // Con un trend, el motivo de que esté desactivada forma parte de su descripción accesible.
          describidaPor={trend ? idSinExperto : undefined}
          onCambio={(v) => onCambio("modoExperto", v)}
        />
        {trend && (
          <Alerta tipo="info" compacta anuncio="ninguno" icono={<Lock />} id={idSinExperto}>
            {sinExpertoConTrend(trend.nombre)}
          </Alerta>
        )}

        {experto && (
          <>
            <Campo
              etiqueta="Tu descripción del clip (en español)"
              ayuda="Descríbelo como se lo contarías a alguien que va a rodarlo: qué se ve, cómo está encuadrado y qué pasa."
            >
              {(props) => (
                <AreaTexto
                  {...props}
                  value={direccion.descripcionExperta}
                  maxLength={DESCRIPCION_EXPERTA_MAXIMA}
                  disabled={deshabilitado}
                  className="min-h-32"
                  onChange={(e) => onCambio("descripcionExperta", e.target.value)}
                />
              )}
            </Campo>
            <Aviso tono="aviso">{AVISO_MODO_EXPERTO}</Aviso>
          </>
        )}
      </div>

      {avisos.map((aviso) => (
        <Aviso key={aviso} tono="info">
          {aviso}
        </Aviso>
      ))}

      {/* Lo que ha pedido, en castellano. Nunca el prompt: eso solo lo ve quien administra. */}
      <Aviso tono="info">
        Le pedirás: <strong className="font-semibold">{resumen.join(" · ")}</strong>. Siempre en{" "}
        <strong className="font-semibold">una sola toma, sin cortes</strong>, elijas lo que elijas.
        {canta
          ? " Lo que se oye sale de tu audio; el texto del guion no se envía como letra y los labios siguen la pista."
          : !habla && " El guion no se le envía al modelo: el personaje sale con la boca cerrada."}
      </Aviso>
    </section>
  );
}
