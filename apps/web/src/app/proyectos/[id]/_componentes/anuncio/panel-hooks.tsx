"use client";

import { Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo } from "@/components/ui/field";
import { HOOK_MAXIMO, type HookPropuesto } from "@/lib/anuncio-guion";
import { firmaDeHooks } from "@/lib/anuncio-pantalla";
import { type ClaveConfirmacion, claveEstable } from "@/lib/asistente";
import { formatearCreditos } from "@/lib/generacion";
import type { PropuestaDeHooks } from "@/server/anuncio/guion";
import type { HookAplicado } from "@/server/anuncio/hook";
import type { PuertaDelGuion } from "@/server/anuncio/puerta-guion";
import type { EstimacionDeTexto } from "@/server/mapa/texto";
import { aplicarHook, pedirHooks } from "./api-anuncio";

/**
 * **Hooks y guion desde el brief**: la palanca 3, detrás de las dos que deciden.
 *
 * Es el único botón de esta pantalla que gasta dinero, así que va con su zona de claridad: qué cuesta, con la
 * palabra «estimación» y la fecha del precio, y la clave de idempotencia que se mantiene mientras no cambie lo que
 * se confirma —repetir el clic no encarga (ni cobra) una segunda propuesta—.
 *
 * Los cinco hooks **no se guardan**: son una propuesta que vive en la pantalla hasta que se elige uno. Elegirlo es
 * gratis, escribe la frase delante del guion y lleva su arranque a la dirección de la primera escena. Si la escena
 * ya tenía cámara o gesto elegidos a mano, no se pisan y se dice por qué.
 */
export function PanelDeHooks({
  proyectoId,
  estimacion,
  puerta,
  hooksPedidos,
  escenas,
  deshabilitado,
  onError,
  onCambio,
}: {
  proyectoId: string;
  estimacion: EstimacionDeTexto;
  puerta: PuertaDelGuion;
  hooksPedidos: number;
  /** Escenas que se piden, las sugeridas para el formato del proyecto. */
  escenas: number;
  deshabilitado?: boolean;
  onError: (mensaje: string) => void;
  /** El guion del proyecto ha cambiado: quien lo use recarga las escenas de la pantalla. */
  onCambio: () => void;
}) {
  const [propuesta, setPropuesta] = useState<PropuestaDeHooks | null>(null);
  const [textos, setTextos] = useState<string[]>([]);
  const [pidiendo, setPidiendo] = useState(false);
  const [aplicando, setAplicando] = useState("");
  const [aplicado, setAplicado] = useState<HookAplicado | null>(null);
  const clave = useRef<ClaveConfirmacion | null>(null);

  const pedir = async () => {
    setPidiendo(true);
    setAplicado(null);
    clave.current = claveEstable(
      clave.current,
      firmaDeHooks(proyectoId, estimacion.sello, estimacion.creditos, escenas),
    );
    const resultado = await pedirHooks(proyectoId, {
      claveIdempotencia: clave.current.valor,
      creditosConfirmados: estimacion.creditos,
      selloEstimacion: estimacion.sello,
      escenas,
    });
    setPidiendo(false);
    if (!resultado.ok) {
      onError(
        resultado.red
          ? `${resultado.error} Puede que la propuesta se haya encargado y cobrado: recarga la página antes de repetir.`
          : resultado.error,
      );
      return;
    }
    setPropuesta(resultado.datos);
    setTextos(resultado.datos.hooks.map((h) => h.texto));
    onCambio();
  };

  const elegir = async (hook: HookPropuesto, texto: string) => {
    setAplicando(hook.texto);
    const resultado = await aplicarHook(proyectoId, { ...hook, texto });
    setAplicando("");
    if (!resultado.ok) {
      onError(resultado.error);
      return;
    }
    setAplicado(resultado.datos);
    onCambio();
  };

  if (!puerta.puede) {
    return <Aviso tono="info">{puerta.motivo}</Aviso>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Zona de claridad del gasto: neutra, sin degradados ni movimiento. */}
      <div className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-4">
        <h4 className="font-bold text-texto">Hooks y guion desde este brief</h4>
        {estimacion.hayEntradas ? (
          <>
            <p className="text-texto-suave">
              Propone <strong className="text-texto">{hooksPedidos} arranques</strong> para elegir y un guion por
              escenas, todo desde <strong className="text-texto">tu ángulo y tu oferta</strong>. Es una{" "}
              <strong className="text-texto">propuesta</strong>: sustituye las escenas en borrador y no aprueba ni
              genera nada.
            </p>
            <p className="font-mono text-texto">
              {estimacion.porCuota ? (
                <>Se paga con la cuota de tu plan en {estimacion.nombreProveedor}: 0 créditos.</>
              ) : (
                <>
                  {formatearCreditos(estimacion.creditos)} (estimación) · {estimacion.nombreProveedor} ·{" "}
                  {estimacion.modelo}
                </>
              )}
            </p>
            <p className="text-sm text-texto-suave">
              Se paga con tu propia clave del proveedor. El importe final lo informa él al terminar.
            </p>
            <div>
              <Boton variante="chispa" disabled={deshabilitado || pidiendo} onClick={pedir}>
                <Sparkles className="size-5" aria-hidden />
                {pidiendo ? "Escribiendo…" : `Pedir ${hooksPedidos} hooks y el guion`}
              </Boton>
            </div>
          </>
        ) : (
          <p className="text-texto-suave">{estimacion.motivo}</p>
        )}
      </div>

      {propuesta !== null && (
        <div className="flex flex-col gap-3">
          {propuesta.motivoGuionNoEscrito !== "" && <Aviso tono="error">{propuesta.motivoGuionNoEscrito}</Aviso>}
          <p className="text-texto-suave">
            {propuesta.escenasEscritas > 0
              ? `Se han escrito ${propuesta.escenasEscritas} escenas en borrador. Elige con qué frase arranca el vídeo: se pone delante del guion.`
              : "Elige con qué frase arranca el vídeo: se pone delante del guion que escribas."}{" "}
            Lo escribió {propuesta.modelo} en {propuesta.nombreProveedor}
            {propuesta.deReserva ? " (la entrada principal de tu mapa falló y entró la de reserva)" : ""}.
          </p>
          <ul className="flex flex-col gap-3">
            {propuesta.hooks.map((hook, indice) => (
              <li
                key={hook.texto}
                className="flex flex-col gap-2 rounded-tarjeta border-2 border-borde bg-superficie p-4"
              >
                <Campo etiqueta={`Hook ${indice + 1}`} ayuda="Puedes reescribirlo antes de elegirlo.">
                  {(p) => (
                    <AreaTexto
                      {...p}
                      rows={2}
                      maxLength={HOOK_MAXIMO}
                      value={textos[indice] ?? hook.texto}
                      onChange={(e) => setTextos(textos.map((t, i) => (i === indice ? e.target.value : t)))}
                    />
                  )}
                </Campo>
                <div className="flex flex-wrap items-center gap-3">
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    disabled={deshabilitado || aplicando !== "" || (textos[indice] ?? "").trim() === ""}
                    cargando={aplicando === hook.texto}
                    onClick={() => elegir(hook, textos[indice] ?? hook.texto)}
                  >
                    Elegir este hook
                  </Boton>
                  <span className="text-sm text-texto-suave">
                    Elegirlo no cuesta nada: los {hooksPedidos} ya están pagados.
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {aplicado !== null && (
        <div className="flex flex-col gap-2 rounded-tarjeta border-2 border-borde bg-superficie p-4">
          <h4 className="font-bold text-texto">Así arranca el vídeo</h4>
          <p className="text-texto-suave">{aplicado.guion}</p>
          {aplicado.camara === "" && aplicado.gesto === "" ? (
            <p className="text-sm text-texto-suave">
              {aplicado.motivoSinDireccion === ""
                ? "El hook no proponía ningún movimiento de cámara ni gesto, así que la dirección de la escena se queda como estaba."
                : aplicado.motivoSinDireccion}
            </p>
          ) : (
            <p className="text-sm text-texto-suave">
              La primera escena arranca con {[aplicado.camara, aplicado.gesto].filter((v) => v !== "").join(" y ")}.
              Puedes cambiarlo en la dirección de la escena.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
