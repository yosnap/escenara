"use client";

import { Sparkles } from "lucide-react";
import { type ReactNode, useId, useRef, useState } from "react";
import { Alerta } from "@/components/ui/alerta";
import { Boton } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
import { PanelAntesDeGenerar } from "@/components/ui/controles";
import { PanelCoste } from "@/components/ui/coste";
import { type EvaluacionVista, firmaDeAvisos } from "@/lib/controles";
import {
  FALTA_AVISO_GASTO_IMAGEN,
  FALTA_DERECHOS_IMAGEN,
  faltasDelEncargo,
  tipoDeLoPendiente,
} from "@/lib/encargo-de-imagen";
import { creditosAConfirmar, type Estimacion, formatearCreditos } from "@/lib/generacion";
import { problemasDeMotivos } from "@/lib/llevar-al-problema";
import { Dialogo } from "../overlay";
import { controlesDeImagen, encargarImagen, estimacionDeImagen } from "./api-imagen-generada";

/** Lo que se encarga: a qué ruta, con qué datos propios y con qué textos. */
export interface PedidoDeImagen {
  titulo: string;
  descripcion: string;
  /** Imagen de partida (una edición) o `null` si sale solo del texto (texto a imagen). */
  medioId: string | null;
  /** Ruta de la ficha que encarga y cobra (`/api/lugares/…/edicion`, `/api/productos/…/generacion`). */
  url: string;
  /** Datos propios del encargo (`tipo`, `papel`…). Entran en la firma: cambiarlos es otra confirmación. */
  cuerpo: Record<string, unknown>;
  etiquetaDerechos: string;
  /** Lo que se dice al encargar: dónde aparecerá el resultado y qué mirar. */
  mensajeEncargado: string;
}

/**
 * **Imagen generada desde una ficha, con su coste confirmado.** Es una imagen, así que cuesta lo que un fotograma y
 * pasa por la misma puerta: estimación con su fecha, controles previos, casilla de derechos, aviso de gasto, clave de
 * idempotencia y reserva en el servidor. Lo usan los lugares (retirar personas, un candidato) y los productos (una
 * vista desde su descripción).
 *
 * Lo que aún falta al abrir es un **paso pendiente** (neutro); solo pasa a bloqueo rojo si se intenta encargar sin
 * ello. Lo que impide de verdad (el saldo no llega, un control frena) es un bloqueo desde el principio.
 */
export function DialogoImagenGenerada({
  pedido,
  abierto,
  listo = true,
  children,
  onCerrar,
  onEncargado,
}: {
  pedido: PedidoDeImagen;
  abierto: boolean;
  /** `false` si a la ficha le falta algo propio para encargar (lo dice ella en `children`). */
  listo?: boolean;
  /** Opciones propias del encargo (la vista de un producto), encima del coste. */
  children?: ReactNode;
  onCerrar: () => void;
  onEncargado: (mensaje: string) => void;
}) {
  const [estimacion, setEstimacion] = useState<Estimacion | null>(null);
  const [controles, setControles] = useState<EvaluacionVista | null>(null);
  const [confirmados, setConfirmados] = useState<string[]>([]);
  const [derechos, setDerechos] = useState(false);
  const [avisoAceptado, setAvisoAceptado] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef<{ firma: string; valor: string } | null>(null);
  const idCasilla = useId();

  const creditos = estimacion ? creditosAConfirmar(estimacion) : null;
  const firma = `${pedido.url}|${JSON.stringify(pedido.cuerpo)}|${estimacion?.sello ?? ""}|${creditos}|${firmaDeAvisos(confirmados)}`;
  const { pendientes, impide } = faltasDelEncargo({ estimacion, controles, confirmados, derechos, avisoAceptado });
  const sitios = {
    [FALTA_DERECHOS_IMAGEN]: `${idCasilla}-derechos`,
    [FALTA_AVISO_GASTO_IMAGEN]: `${idCasilla}-aviso-gasto`,
  };

  /** El coste se pide al pulsar, no al cargar la ficha: mirar un lugar o un producto no consulta saldos. */
  const preparar = async () => {
    setOcupado(true);
    setError(null);
    const precio = await estimacionDeImagen(pedido.medioId === null);
    if (!precio.ok) {
      setOcupado(false);
      setError(`No se ha podido calcular el coste: ${precio.error} No se ha cobrado nada.`);
      return;
    }
    const previo = await controlesDeImagen(pedido.medioId, precio.datos.modelo);
    setOcupado(false);
    setEstimacion(precio.datos);
    if (previo.ok) setControles(previo.datos);
    else setError(`No se han podido comprobar los controles previos: ${previo.error}`);
  };

  const encargar = async () => {
    if (!estimacion || creditos === null) return;
    if (pendientes.length > 0 || impide.length > 0 || !listo) {
      setIntentado(true);
      return;
    }
    if (clave.current?.firma !== firma) clave.current = { firma, valor: crypto.randomUUID() };
    setOcupado(true);
    setError(null);
    const respuesta = await encargarImagen(pedido.url, {
      ...pedido.cuerpo,
      creditosConfirmados: creditos,
      derechos,
      claveIdempotencia: clave.current.valor,
      selloEstimacion: estimacion.sello,
      modelo: estimacion.modelo,
      avisoUmbralAceptado: avisoAceptado,
      avisosConfirmados: confirmados,
    });
    setOcupado(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    onEncargado(pedido.mensajeEncargado);
  };

  const bloqueado = pendientes.length > 0 || impide.length > 0 || !listo;

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoCambio={(valor) => {
        if (!valor) onCerrar();
      }}
      titulo={pedido.titulo}
      descripcion={pedido.descripcion}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </Boton>
          {estimacion === null ? (
            <Boton variante="secundario" cargando={ocupado} onClick={() => void preparar()}>
              Ver lo que cuesta
            </Boton>
          ) : (
            <Boton
              variante="chispa"
              icono={<Sparkles className="size-5" />}
              cargando={ocupado}
              // Con algo pendiente sigue enfocable: al pulsarlo dice qué falta en lugar de encargar.
              aria-disabled={bloqueado || undefined}
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              onClick={() => void encargar()}
            >
              Encargar
            </Boton>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {children}
        {error && (
          <Alerta tipo="error" compacta>
            {error}
          </Alerta>
        )}
        {estimacion && (
          <PanelCoste estimacion={estimacion}>
            <div className="flex flex-col gap-3">
              <p className="text-sm text-texto-suave">
                Es una imagen:{" "}
                <strong className="text-texto">{creditos === null ? "—" : formatearCreditos(creditos)}</strong>.
              </p>
              <Casilla
                etiqueta={pedido.etiquetaDerechos}
                marcada={derechos}
                requisito={`${idCasilla}-derechos`}
                onCambio={setDerechos}
                deshabilitado={ocupado}
              />
              {estimacion.superaUmbral && (
                <Casilla
                  etiqueta={`Sí, quiero gastar ${creditos === null ? "" : formatearCreditos(creditos)}`}
                  marcada={avisoAceptado}
                  requisito={`${idCasilla}-aviso-gasto`}
                  onCambio={setAvisoAceptado}
                  deshabilitado={ocupado}
                />
              )}
            </div>
          </PanelCoste>
        )}
        {controles && (
          <PanelAntesDeGenerar
            evaluacion={controles}
            confirmados={confirmados}
            deshabilitado={ocupado}
            onConfirmar={(regla, valor) =>
              setConfirmados((antes) => (valor ? [...new Set([...antes, regla])] : antes.filter((r) => r !== regla)))
            }
          />
        )}
        {estimacion && impide.length > 0 && (
          <Alerta tipo="bloqueo" compacta anuncio="ninguno" protege elementos={problemasDeMotivos(impide)} />
        )}
        {estimacion && pendientes.length > 0 && (
          <Alerta
            tipo={tipoDeLoPendiente(intentado)}
            compacta
            anuncio={intentado ? "alerta" : "ninguno"}
            protege
            elementos={problemasDeMotivos(pendientes, sitios)}
          />
        )}
      </div>
    </Dialogo>
  );
}
