"use client";

import { Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { Boton } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
import { PanelCoste } from "@/components/ui/coste";
import { Aviso } from "@/components/ui/feedback";
import { Dialogo } from "@/components/ui/overlay";
import { pedirVistaSintetica } from "@/components/ui/personajes/api-personajes";
import { ETIQUETA_VISTA, type Vista } from "@/lib/captura-personaje";
import { type Estimacion, formatearCreditos, type TrabajoVista } from "@/lib/generacion";
import { AVISO_SIN_TERCEROS } from "@/lib/personajes";

/**
 * Confirmación de una vista sintética. Es dinero del usuario en la cuenta del proveedor, así que se pide
 * exactamente igual que en «Crear»: el coste estimado delante, la casilla de derecho de uso, la revisión de
 * referencias (ADR-0009) y el aviso extra si pasa del umbral de la instalación.
 *
 * Y se dice claramente **qué es lo que va a salir**: una imagen generada a partir de sus fotos, que se marca
 * como tal y no cuenta como foto suya.
 */
export function DialogoVistaSintetica({
  personajeId,
  vista,
  estimacion,
  abierto,
  onAbiertoCambio,
  onEncolada,
}: {
  personajeId: string;
  vista: Vista;
  /** Estimación ya pedida al servidor al abrir el diálogo: aquí no se calcula ningún precio. */
  estimacion: Estimacion;
  abierto: boolean;
  onAbiertoCambio: (abierto: boolean) => void;
  /** Se llama con el trabajo encolado: la ficha lo sigue como cualquier otro. */
  onEncolada: (trabajo: TrabajoVista) => void;
}) {
  const [derechos, setDerechos] = useState(false);
  const [sinTerceros, setSinTerceros] = useState(false);
  const [avisoAceptado, setAvisoAceptado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Clave de esta confirmación. **Se conserva mientras no cambie lo que se confirma** (misma vista, mismo
   * precio, mismos créditos), igual que en `crear/_componentes/panel-generar.tsx`: si se regenerara en cada
   * pulsación, un reintento tras un fallo de red pediría un **segundo** trabajo al proveedor y se pagaría dos
   * veces lo mismo. Con la misma clave, el servidor devuelve el trabajo que ya creó.
   */
  const clave = useRef<{ firma: string; valor: string } | null>(null);

  const creditos = Math.ceil(estimacion.creditos);
  const firma = `${vista}|${estimacion.sello}|${creditos}`;

  const bloqueos = [
    ...(derechos ? [] : ["Falta confirmar que tienes derecho a usar estas fotos."]),
    ...(sinTerceros ? [] : ["Falta confirmar la revisión de las fotos."]),
    ...(estimacion.superaUmbral && !avisoAceptado ? ["Falta aceptar el aviso de gasto."] : []),
    ...(estimacion.alcanza ? [] : ["Tu saldo de KIE no llega para este trabajo."]),
  ];

  const generar = async () => {
    if (clave.current?.firma !== firma) clave.current = { firma, valor: crypto.randomUUID() };
    setEnviando(true);
    setError(null);
    const respuesta = await pedirVistaSintetica(personajeId, {
      vista,
      creditosConfirmados: creditos,
      derechos,
      sinTerceros,
      avisoUmbralAceptado: avisoAceptado,
      claveIdempotencia: clave.current.valor,
      modelo: estimacion.modelo,
      selloEstimacion: estimacion.sello,
    });
    setEnviando(false);
    if (!respuesta.ok) {
      // Un fallo de red no dice si la petición llegó: puede haberse encargado ya, así que no se invita a
      // repetir a ciegas. Volver a pulsar reenvía **la misma clave**, así que tampoco se pagaría dos veces.
      setError(
        respuesta.red
          ? `${respuesta.error} Puede que la vista se haya encargado: revisa el historial antes de repetirlo.`
          : respuesta.error,
      );
      return;
    }
    onEncolada(respuesta.datos.trabajo);
    onAbiertoCambio(false);
  };

  return (
    <Dialogo
      titulo={`Generar «${ETIQUETA_VISTA[vista].toLowerCase()}»`}
      descripcion="Se creará una imagen a partir de las fotos que ya tienes de este personaje."
      abierto={abierto}
      onAbiertoCambio={onAbiertoCambio}
      tamano="md"
    >
      <div className="flex flex-col gap-4">
        <Aviso tono="info">
          Lo que salga de aquí es una <strong className="font-semibold">vista generada</strong>, no una foto: se
          guardará marcada como tal, se mostrará siempre con su distintivo y{" "}
          <strong className="font-semibold">no cuenta</strong> para el mínimo de fotos originales del personaje. Si lo
          que quieres es cubrir esa vista de verdad, haz la foto: sale gratis y guía mucho mejor.
        </Aviso>

        <PanelCoste estimacion={estimacion}>
          <div className="flex flex-col gap-3">
            <Casilla
              etiqueta="Tengo derecho a usar estas fotos"
              marcada={derechos}
              onCambio={setDerechos}
              deshabilitado={enviando}
            />
            <Casilla
              etiqueta="He revisado las fotos: no aparece ninguna otra persona ni ningún menor"
              descripcion={AVISO_SIN_TERCEROS}
              marcada={sinTerceros}
              onCambio={setSinTerceros}
              deshabilitado={enviando}
            />
            {estimacion.superaUmbral && (
              <Casilla
                etiqueta={`Sí, quiero gastar ${formatearCreditos(creditos)}`}
                marcada={avisoAceptado}
                onCambio={setAvisoAceptado}
                deshabilitado={enviando}
              />
            )}
          </div>
        </PanelCoste>

        {error && <Aviso tono="error">{error}</Aviso>}
        {bloqueos.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm text-texto-suave">
            {bloqueos.map((motivo) => (
              <li key={motivo}>{motivo}</li>
            ))}
          </ul>
        )}

        <Boton
          className="self-start"
          variante="chispa"
          icono={<Sparkles className="size-4" />}
          cargando={enviando}
          disabled={bloqueos.length > 0}
          onClick={() => void generar()}
        >
          Generar la vista
        </Boton>
      </div>
    </Dialogo>
  );
}
