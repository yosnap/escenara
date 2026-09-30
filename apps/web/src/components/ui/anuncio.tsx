"use client";

import { Ban, Check, ScanFace, ShieldAlert, ThumbsDown, ThumbsUp } from "lucide-react";
import type { ReactNode } from "react";
import type { AnguloVista, OfertaVista } from "@/lib/anuncio";
import { AVISO_OFERTA_INCOMPLETA } from "@/lib/anuncio";
import { type AnguloParaVariante, camposDeOferta, TEXTO_DECLARACION } from "@/lib/anuncio-pantalla";
import {
  type CorreccionHumana,
  type DecisionVista,
  NOMBRE_VEREDICTO,
  type VeredictoCoherencia,
} from "@/lib/coherencia";
import { Boton } from "./button";
import { Casilla } from "./choice";
import { cn } from "./cn";

/**
 * Componentes de la **estrategia del anuncio** (0.27.0): elegir el ángulo, ver la oferta, declarar veracidad y
 * leer el veredicto del ángulo.
 *
 * Dos registros visuales a propósito, y la frontera es el dinero y la responsabilidad:
 *
 * - **elegir el ángulo** es creación: tarjetas con color, relieve y movimiento, porque es la decisión que más
 *   cambia el anuncio y merece que apetezca tomarla;
 * - **declarar que lo que afirmas es cierto** y **lo que la oferta no dice** son zonas de claridad: borde neutro,
 *   sin degradado y sin movimiento. Nadie firma nada encima de una animación.
 */

// ── El ángulo, elección única ───────────────────────────────────────────────────────────────────────────

/**
 * Los doce ángulos del catálogo, **uno solo elegido**. No es un desplegable: el ángulo se elige leyendo por dónde
 * entra y su ejemplo, y eso no cabe en una línea de un `<select>`.
 *
 * Volver a pulsar el elegido **no lo quita**: un brief sin ángulo no se puede usar, así que quitarlo por accidente
 * sería perder trabajo. Se cambia eligiendo otro.
 */
export function SelectorDeAngulo({
  angulos,
  elegido,
  deshabilitado,
  onElegir,
}: {
  angulos: readonly AnguloVista[];
  /** Clave del ángulo elegido; vacía = sin elegir. */
  elegido: string;
  deshabilitado?: boolean;
  onElegir: (clave: string) => void;
}) {
  if (angulos.length === 0) {
    return (
      <p className="text-texto-suave">
        El catálogo de ángulos de esta instalación está vacío. Quien la administra los edita en Admin › Presets, en la
        categoría «Ángulo del anuncio».
      </p>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {angulos.map((angulo) => {
        const activo = angulo.clave === elegido;
        return (
          <li key={angulo.clave}>
            <button
              type="button"
              aria-pressed={activo}
              disabled={deshabilitado}
              onClick={() => onElegir(angulo.clave)}
              className={cn(
                "flex h-full w-full flex-col items-start gap-1.5 rounded-tarjeta border-2 p-4 text-left transition-all duration-(--motion-base) ease-out",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento",
                activo
                  ? "border-transparent bg-degradado-chispa text-[#182032] shadow-lg shadow-v-coral/30"
                  : "border-borde bg-superficie text-texto hover:-translate-y-0.5 hover:border-acento hover:shadow-lg",
                deshabilitado && "cursor-not-allowed opacity-55 hover:translate-y-0 hover:border-borde",
              )}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="font-bold">{angulo.nombre}</span>
                {activo && <Check className="size-4 shrink-0" strokeWidth={3} aria-hidden />}
              </span>
              <span className={cn("text-sm", activo ? "text-[#182032]/85" : "text-texto-suave")}>
                {angulo.definicion}
              </span>
              {angulo.porDondeEntra !== "" && (
                <span className={cn("text-sm font-semibold", activo ? "text-[#182032]/80" : "text-texto")}>
                  Por dónde entra: {angulo.porDondeEntra}
                </span>
              )}
              {angulo.ejemplo !== "" && (
                <span className={cn("text-sm italic", activo ? "text-[#182032]/75" : "text-texto-suave")}>
                  «{angulo.ejemplo}»
                </span>
              )}
              {angulo.exigeDeclaracion && (
                <span
                  className={cn(
                    "mt-auto inline-flex items-center gap-1 pt-1 text-xs font-semibold",
                    activo ? "text-[#182032]/80" : "text-aviso",
                  )}
                >
                  <ShieldAlert className="size-3.5" aria-hidden />
                  Pide declarar que lo que afirmas es cierto
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ── Los ángulos de una tanda de variantes, elección múltiple ─────────────────────────────────────────────

/**
 * Los ángulos de los que crear **proyectos hermanos**, varios a la vez. Un ángulo que no se puede pedir sale
 * deshabilitado **con su motivo escrito** —normalmente, que ya hay un hermano con ese ángulo—, nunca solo en gris.
 */
export function ElectorDeAngulos({
  angulos,
  elegidos,
  deshabilitado,
  onCambio,
}: {
  angulos: readonly AnguloParaVariante[];
  elegidos: readonly string[];
  deshabilitado?: boolean;
  onCambio: (claves: string[]) => void;
}) {
  const alternar = (clave: string) =>
    onCambio(elegidos.includes(clave) ? elegidos.filter((c) => c !== clave) : [...elegidos, clave]);

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {angulos.map(({ angulo, elegible, motivo, exigeDeclaracion }) => (
        <li
          key={angulo.clave}
          className={cn("rounded-control border border-borde bg-superficie px-3 py-2", !elegible && "opacity-70")}
        >
          <Casilla
            etiqueta={
              <span className="flex items-center gap-1.5 font-semibold">
                {angulo.nombre}
                {!elegible && <Ban className="size-3.5 shrink-0 text-error" aria-hidden />}
              </span>
            }
            descripcion={
              <>
                {angulo.porDondeEntra !== "" && <span className="block">{angulo.porDondeEntra}</span>}
                {exigeDeclaracion && (
                  <span className="block font-semibold text-aviso">Afirma algo comprobable: pide declaración.</span>
                )}
                {/* alerta-permitida: motivo de un ángulo no elegible, dentro de su tarjeta */}
                {!elegible && motivo !== "" && <span className="block font-medium text-error">{motivo}</span>}
              </>
            }
            marcada={elegidos.includes(angulo.clave)}
            deshabilitado={deshabilitado || !elegible}
            onCambio={() => alternar(angulo.clave)}
          />
        </li>
      ))}
    </ul>
  );
}

// ── La oferta, lo que dice y lo que no ──────────────────────────────────────────────────────────────────

/**
 * La oferta como la va a recibir el asistente: **qué se da** y los cuatro opcionales, con los vacíos marcados como
 * lo que son. Es una zona de claridad: aquí es donde se entiende que un campo vacío no se rellena solo.
 */
export function ResumenDeOferta({ oferta }: { oferta: OfertaVista | null }) {
  if (oferta === null) {
    return (
      <p className="text-texto-suave">
        Este brief todavía no tiene oferta. Sin «qué se le da» no se puede pedir el guion: un anuncio sin oferta es un
        vídeo bonito que no pide nada.
      </p>
    );
  }
  const campos = camposDeOferta(oferta);
  return (
    <div className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-4">
      <div>
        <h4 className="font-bold text-texto">Lo que dirá el guion de tu oferta</h4>
        <p className="text-sm text-texto-suave">
          Para el producto <strong className="text-texto">{oferta.productoNombre}</strong>.
        </p>
      </div>
      <dl className="flex flex-col gap-2">
        <div className="flex flex-col">
          <dt className="text-sm font-semibold text-texto">Qué se le da</dt>
          <dd className="text-texto-suave">{oferta.queSeDa}</dd>
        </div>
        {campos.map((campo) => (
          <div key={campo.clave} className="flex flex-col">
            <dt className="text-sm font-semibold text-texto">{campo.etiqueta}</dt>
            <dd className={campo.valor === "" ? "text-sm text-texto-suave italic" : "text-texto-suave"}>
              {campo.valor === "" ? "Vacío: no se dirá nada de esto." : campo.valor}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-texto-suave">{AVISO_OFERTA_INCOMPLETA}</p>
    </div>
  );
}

// ── La declaración de veracidad ─────────────────────────────────────────────────────────────────────────

/**
 * Zona de claridad de la **declaración de veracidad**: el aviso de por qué se pide, el texto **entero** que se
 * acepta y la casilla. Sin degradado y sin movimiento: es lo que se guarda con su fecha y su IP como prueba de lo
 * que alguien afirmó.
 *
 * Si ya está registrada, se dice y no se vuelve a pedir: no hay forma de «desdeclararla» desde aquí, porque la
 * prueba de que se aceptó no se borra cambiando de opinión en una casilla.
 */
export function ZonaDeDeclaracion({
  nombreAngulo,
  aviso,
  registrada,
  aceptada,
  deshabilitado,
  onAceptar,
  children,
}: {
  nombreAngulo: string;
  /** Por qué se pide, redactado por el servidor o por el catálogo. */
  aviso: string;
  /** `true` cuando ya hay una declaración guardada para este proyecto y este ángulo. */
  registrada: boolean;
  /** Marcada o no, cuando todavía no está registrada. */
  aceptada?: boolean;
  deshabilitado?: boolean;
  onAceptar?: (valor: boolean) => void;
  /** Hueco para el botón que la registra, cuando quien lo usa la envía aparte. */
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={`Declaración de veracidad del ángulo ${nombreAngulo}`}
      className="flex flex-col gap-3 rounded-tarjeta border-2 border-aviso/50 bg-superficie p-4"
    >
      <h4 className="flex items-center gap-2 font-bold text-texto">
        <ShieldAlert className="size-5 shrink-0 text-aviso" aria-hidden />
        El ángulo «{nombreAngulo}» afirma algo comprobable
      </h4>
      <p className="text-texto-suave">{aviso}</p>
      {registrada ? (
        <p className="font-semibold text-correcto">
          Ya lo has declarado para este ángulo. Se guardó con su fecha, y el texto que aceptaste queda tal cual aunque
          cambie en una versión futura.
        </p>
      ) : (
        <>
          <Casilla
            etiqueta="Lo declaro"
            descripcion={TEXTO_DECLARACION}
            marcada={aceptada}
            deshabilitado={deshabilitado}
            onCambio={(v) => onAceptar?.(v)}
          />
          {children}
        </>
      )}
    </section>
  );
}

// ── El veredicto del ángulo ─────────────────────────────────────────────────────────────────────────────

const TONO: Record<VeredictoCoherencia, string> = {
  pasa: "border-correcto/45 text-correcto",
  revisar: "border-aviso/45 text-aviso",
  no_pasa: "border-error/45 text-error",
};

/**
 * El veredicto de `angulo_fiel` con su evidencia —si el guion **mezcla ángulos**— y su confianza, y los dos botones de
 * corrección humana, que son la única etiqueta con la que se mide si acierta (0.24.0).
 *
 * Se pide **a mano**: ni abrir la pantalla ni guardar el brief lo disparan, porque lo paga el tope diario de Jev de
 * la instalación. Y en sombra se dice con todas las letras que no bloquea nada.
 */
export function PanelAnguloFiel({
  decision,
  motivo,
  enSombra,
  ocupado,
  onComprobar,
  onCorregir,
}: {
  decision: DecisionVista | null;
  /** Por qué no hay veredicto. Vacío cuando sí lo hay. */
  motivo: string;
  enSombra: boolean;
  ocupado: boolean;
  onComprobar: () => void;
  onCorregir: (decisionId: string, correccion: CorreccionHumana) => void;
}) {
  return (
    <section aria-label="Fidelidad al ángulo" className="flex flex-col gap-3 rounded-control bg-elevada p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-bold text-texto">¿El guion responde al ángulo?</h4>
        <Boton variante="secundario" tamano="sm" disabled={ocupado} onClick={onComprobar}>
          <ScanFace className="size-4" />
          {decision === null ? "Comprobar el ángulo" : "Volver a comprobar"}
        </Boton>
      </div>
      <p className="text-sm text-texto-suave">
        Comprueba tres cosas del guion: que responde al ángulo que elegiste, que <strong>no mezcla</strong> otros y que
        dice la oferta como la definiste.{" "}
        {enSombra ? (
          <>
            Va <strong>en sombra</strong>: se registra y <strong>no bloquea nada</strong> —ni el plan, ni la producción,
            ni pedir otro guion—. Está para ver si acierta, y para eso hace falta que digas si tiene razón.
          </>
        ) : (
          <>
            Está en <strong>Activa</strong>, pero el ángulo <strong>todavía no bloquea nada</strong>: el veredicto se
            registra y se muestra aquí, y no frena el plan, la producción ni pedir otro guion.
          </>
        )}
      </p>

      {decision === null ? (
        <p className="text-sm text-texto-suave">
          {motivo === "" ? "Todavía no se ha comprobado este anuncio. Lo paga esta instalación con su clave." : motivo}
        </p>
      ) : (
        <div className="flex flex-col gap-2 rounded-control bg-superficie p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-texto">{decision.nombre}</p>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-semibold ${TONO[decision.veredicto]}`}
            >
              {NOMBRE_VEREDICTO[decision.veredicto]}
            </span>
          </div>
          <p className="text-sm text-texto-suave">{decision.evidencia}</p>
          <p className="text-xs text-texto-suave">
            Confianza {Math.round(decision.confianza * 100)} % (umbral {Math.round(decision.umbral * 100)} %). La
            confianza dice cómo de concentrada está la respuesta del modelo, no cuántas veces acierta. Decidió{" "}
            {decision.modeloDecision}.
          </p>
          {decision.correccion === null ? (
            <div className="flex flex-wrap gap-2">
              <Boton
                variante="secundario"
                tamano="sm"
                disabled={ocupado}
                onClick={() => onCorregir(decision.id, "acierta")}
              >
                <ThumbsUp className="size-4" />
                Tiene razón
              </Boton>
              <Boton
                variante="secundario"
                tamano="sm"
                disabled={ocupado}
                onClick={() => onCorregir(decision.id, "se_equivoca")}
              >
                <ThumbsDown className="size-4" />
                Se equivoca
              </Boton>
            </div>
          ) : (
            <p className="text-xs font-semibold text-texto-suave">
              {decision.correccion === "acierta" ? "Dijiste que tiene razón." : "Dijiste que se equivoca."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
