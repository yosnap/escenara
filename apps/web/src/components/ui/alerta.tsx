"use client";

import { AlertOctagon, ArrowDown, ArrowRight, Ban, CheckCircle2, TriangleAlert, X } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { claveDeProblema, type Problema, primeroPendiente, sinRepetidos } from "@/lib/llevar-al-problema";
import { Boton } from "./button";
import { cn } from "./cn";
import { useNavegacionDePasos } from "./contexto-pasos";
import { CLASES_FLECHA, CLASES_FLECHA_ANIMADA, llevarAlProblema } from "./llevar-al-problema";

/**
 * **Alerta**: el componente único para todo lo que la plataforma tiene que decir de un problema o de un resultado.
 *
 * - **bloqueo**: algo impide seguir (falta una casilla, un paso está cerrado). Persiste hasta que se resuelve.
 * - **error**: algo ha fallado (una petición, una generación). Persiste hasta que se resuelve o se reintenta.
 * - **aviso**: información que conviene leer. Solo se puede descartar si no protege dinero ni consentimiento.
 * - **hecho**: confirmación de que algo ha salido bien (guardado, enviado). No es un problema: no lleva a ningún sitio.
 *
 * Lleva al problema: cada elemento de la lista (o la acción «Ir al campo») cambia al paso que lo contiene, lo desplaza a
 * la vista, lo resalta y lo señala con una flecha. Es zona de claridad: borde completo (nunca lateral), icono y texto
 * (nunca solo color) y sin movimiento propio; la flecha es lo único que se mueve, y no lo hace con «reducir movimiento».
 *
 * Accesibilidad: el título y el mensaje van en **una** región viva (`alert` para bloqueo y error, `status` para aviso y
 * hecho), así que se anuncian una sola vez; la lista de elementos y los botones quedan fuera de la región para no
 * repetirse al marcar una casilla. Una alerta que ya estaba en la pantalla al abrirla (el bloque de requisitos) no se
 * anuncia: `anuncio="ninguno"`, y entonces es una región con nombre.
 */

export type TipoAlerta = "bloqueo" | "error" | "aviso" | "hecho";
export type AnuncioAlerta = "alerta" | "estado" | "ninguno";

interface EstiloAlerta {
  etiqueta: string;
  icono: ReactNode;
  borde: string;
  texto: string;
  circulo: string;
  anuncio: AnuncioAlerta;
}

export const ESTILO_ALERTA: Record<TipoAlerta, EstiloAlerta> = {
  bloqueo: {
    etiqueta: "Bloqueo",
    icono: <Ban />,
    borde: "border-error",
    texto: "text-error",
    circulo: "bg-error/12",
    anuncio: "alerta",
  },
  error: {
    etiqueta: "Error",
    icono: <AlertOctagon />,
    borde: "border-error/60",
    texto: "text-error",
    circulo: "bg-error/12",
    anuncio: "alerta",
  },
  aviso: {
    etiqueta: "Aviso",
    icono: <TriangleAlert />,
    borde: "border-aviso/60",
    texto: "text-aviso",
    circulo: "bg-aviso/12",
    anuncio: "estado",
  },
  hecho: {
    etiqueta: "Hecho",
    icono: <CheckCircle2 />,
    borde: "border-correcto/45",
    texto: "text-correcto",
    circulo: "bg-correcto/12",
    anuncio: "estado",
  },
};

const ROL: Record<AnuncioAlerta, "alert" | "status" | undefined> = {
  alerta: "alert",
  estado: "status",
  ninguno: undefined,
};

export interface AlertaProps<T extends Problema = Problema> {
  tipo: TipoAlerta;
  /** Titular corto. Sin él, el mensaje hace de titular. */
  titulo?: ReactNode;
  /** El mensaje: la causa concreta y qué hacer. */
  children?: ReactNode;
  /** Problemas que hay que resolver, en orden: el primero se destaca y «Ir al primero» lleva a él. */
  elementos?: readonly T[];
  /** Un único sitio al que llevar desde el mensaje («Ir al campo»). */
  destino?: T;
  /** Texto de la acción que lleva a cada problema. */
  textoIr?: string;
  /** Cómo llegar a un problema. Por defecto, `llevarAlProblema` con el flujo por pasos que contenga a la alerta. */
  onIr?: (problema: T) => void;
  /** Botones o enlaces propios, debajo del mensaje. */
  accion?: ReactNode;
  /** Solo un **aviso** o un **hecho** se pueden descartar, y nunca si protegen dinero o consentimiento. */
  descartable?: boolean;
  /** La alerta protege dinero o consentimiento (gasto, derechos, revisión de fotos): nunca se descarta. */
  protege?: boolean;
  onDescartar?: () => void;
  /** Cómo se anuncia. Por defecto, según el tipo; `ninguno` para lo que ya está en la pantalla al abrirla. */
  anuncio?: AnuncioAlerta;
  /** Icono propio, si el del tipo no lo dice bien (por ejemplo, el de un estado de preparación). */
  icono?: ReactNode;
  /** Rótulo del tipo, si el de siempre no encaja (por ejemplo, «Necesita ajustes»). */
  etiqueta?: string;
  /** Versión apretada para avisos breves dentro de un formulario o un diálogo. */
  compacta?: boolean;
  className?: string;
}

/** ¿Se puede descartar? Bloqueos y errores persisten; lo que protege dinero o consentimiento, también. */
export const esDescartable = (tipo: TipoAlerta, descartable?: boolean, protege?: boolean) =>
  descartable === true && protege !== true && (tipo === "aviso" || tipo === "hecho");

export function Alerta<T extends Problema = Problema>({
  tipo,
  titulo,
  children,
  elementos = [],
  destino,
  textoIr = "Ir al campo",
  onIr,
  accion,
  descartable,
  protege,
  onDescartar,
  anuncio,
  icono,
  etiqueta,
  compacta = false,
  className,
}: AlertaProps<T>) {
  const estilo = ESTILO_ALERTA[tipo];
  const navegacion = useNavegacionDePasos();
  const idTitulo = useId();
  const [descartada, setDescartada] = useState(false);
  if (descartada) return null;

  const ir = onIr ?? ((problema: T) => llevarAlProblema(problema, navegacion));
  const lista = sinRepetidos(elementos);
  const primero = primeroPendiente(lista);
  const conSitio = lista.filter((p) => p.id !== undefined && p.id !== "").length;
  const modo = anuncio ?? estilo.anuncio;
  const puedeDescartar = esDescartable(tipo, descartable, protege);

  const cabecera = (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full",
          compacta ? "size-8 [&>svg]:size-4" : "size-10 [&>svg]:size-5",
          estilo.circulo,
          estilo.texto,
        )}
      >
        {icono ?? estilo.icono}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 self-center">
        {/* El rótulo del tipo se lee con el resto: dice qué es sin depender del color. */}
        <span className={cn("text-xs font-bold uppercase tracking-wide", estilo.texto)}>
          {etiqueta ?? estilo.etiqueta}
        </span>
        {titulo !== undefined && (
          <p id={idTitulo} className="font-bold text-texto">
            {titulo}
          </p>
        )}
        {children !== undefined && children !== null && children !== false && (
          <div className={cn("text-texto", titulo !== undefined && "text-sm")}>{children}</div>
        )}
      </div>
    </div>
  );

  return (
    <section
      data-alerta={tipo}
      aria-labelledby={modo === "ninguno" && titulo !== undefined ? idTitulo : undefined}
      aria-label={modo === "ninguno" && titulo === undefined ? (etiqueta ?? estilo.etiqueta) : undefined}
      className={cn(
        "relative flex flex-col rounded-tarjeta border-2 bg-superficie shadow-sm",
        compacta ? "gap-2 p-3" : "gap-3 p-4",
        puedeDescartar && "pr-12",
        estilo.borde,
        className,
      )}
    >
      {modo === "ninguno" ? cabecera : <div role={ROL[modo]}>{cabecera}</div>}

      {lista.length > 0 && (
        <ul className="flex flex-col gap-1">
          {lista.map((problema, i) => {
            const destacado = problema === primero;
            const numero = (
              <span
                aria-hidden
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  destacado ? cn(estilo.circulo, estilo.texto, "ring-2 ring-current") : "bg-elevada text-texto-suave",
                )}
              >
                {i + 1}
              </span>
            );
            return (
              <li key={claveDeProblema(problema)}>
                {problema.id ? (
                  <button
                    type="button"
                    onClick={() => ir(problema)}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-control px-2 text-left text-texto hover:bg-elevada",
                      destacado && "bg-elevada font-semibold",
                    )}
                  >
                    {numero}
                    <span className="flex-1">{problema.texto}</span>
                    <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-acento">
                      {textoIr}
                      <ArrowRight className="size-4" aria-hidden />
                    </span>
                  </button>
                ) : (
                  <p className="flex min-h-11 items-center gap-3 px-2 text-texto">
                    {numero}
                    <span className="flex-1">{problema.texto}</span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {(accion || destino?.id || (primero && conSitio > 1)) && (
        <div className="flex flex-wrap items-center gap-2">
          {primero && conSitio > 1 && (
            <Boton variante="secundario" onClick={() => ir(primero)}>
              <ArrowDown className="size-4" aria-hidden />
              Ir al primero
            </Boton>
          )}
          {destino?.id && (
            <Boton variante="secundario" onClick={() => ir(destino)}>
              {textoIr}
              <ArrowRight className="size-4" aria-hidden />
            </Boton>
          )}
          {accion}
        </div>
      )}

      {puedeDescartar && (
        <button
          type="button"
          aria-label="Descartar aviso"
          onClick={() => {
            setDescartada(true);
            onDescartar?.();
          }}
          className="absolute top-1 right-1 flex size-11 items-center justify-center rounded-control text-texto-suave hover:bg-elevada hover:text-texto"
        >
          <X className="size-5" aria-hidden />
        </button>
      )}
    </section>
  );
}

/**
 * La flecha que señala el problema, como elemento de React: la usa el catálogo para enseñarla quieta o moviéndose. En
 * las pantallas la pone `llevarAlProblema` encima del bloque, con las mismas clases. Siempre `aria-hidden`: lo que dice
 * ya lo dicen el foco y el aro.
 */
export function FlechaProblema({ animada = true }: { animada?: boolean }) {
  return (
    <span aria-hidden data-flecha-problema="" className={cn(CLASES_FLECHA, animada && CLASES_FLECHA_ANIMADA)}>
      <ArrowDown className="size-5" strokeWidth={2.5} />
    </span>
  );
}
