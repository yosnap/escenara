"use client";

import { Sparkles } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Alerta } from "@/components/ui/alerta";
import { Boton } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
import { PanelAntesDeGenerar } from "@/components/ui/controles";
import { PanelCoste } from "@/components/ui/coste";
import { Aviso } from "@/components/ui/feedback";
import { Dialogo } from "@/components/ui/overlay";
import { pedirVistasQueFaltan, type VistasEncargadas } from "@/components/ui/personajes/api-personajes";
import { type ClaveConfirmacion, claveEstable } from "@/lib/asistente";
import { ETIQUETA_VISTA, type Vista } from "@/lib/captura-personaje";
import { bloqueosDeControles, type EvaluacionVista, firmaDeAvisos } from "@/lib/controles";
import { creditosAConfirmar, type Estimacion, formatearCreditos } from "@/lib/generacion";
import { problemasDeMotivos } from "@/lib/llevar-al-problema";
import { AVISO_SIN_TERCEROS } from "@/lib/personajes";

/** Motivos que corresponden a una casilla: con ellos la alerta lleva a la casilla pendiente. */
const FALTA_DERECHOS = "Falta confirmar que tienes derecho a usar estas fotos.";
const FALTA_SIN_TERCEROS = "Falta confirmar la revisión de las fotos.";
const FALTA_AVISO_GASTO = "Falta aceptar el aviso de gasto.";

/**
 * «Generar todas las vistas que faltan» (0.22.1). No es un camino de dinero nuevo: por dentro es una vista
 * sintética por cada vista que falta, cada una con su reserva, su idempotencia y sus controles previos.
 *
 * Lo que aporta esta pantalla es decir el **total** antes de nada —el precio de una imagen por cada vista que
 * falta— y, después, cuáles se han encargado y cuáles no, con su motivo. Las que no salen no se cobran.
 */

export function DialogoTodasLasVistas({
  personajeId,
  inventado,
  vistas,
  estimacion,
  controles,
  abierto,
  onAbiertoCambio,
  onEncargadas,
}: {
  personajeId: string;
  inventado: boolean;
  /** Vistas que faltan, tal como las calcula `vistasPorGenerar`. Es lo que el servidor va a encargar. */
  vistas: readonly Vista[];
  /** Coste de **una** imagen, ya pedido al servidor: aquí no se calcula ningún precio. */
  estimacion: Estimacion;
  controles: EvaluacionVista;
  abierto: boolean;
  onAbiertoCambio: (abierto: boolean) => void;
  onEncargadas: (encargadas: VistasEncargadas) => void;
}) {
  const [derechos, setDerechos] = useState(false);
  const [sinTerceros, setSinTerceros] = useState(false);
  const [avisoAceptado, setAvisoAceptado] = useState(false);
  const [confirmados, setConfirmados] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef<ClaveConfirmacion | null>(null);

  // Lo que se confirma por imagen es el total de su envío (modelo + traducción), igual que en «Crear»; el
  // total que se enseña es ese precio por cada vista que falta.
  const porVista = creditosAConfirmar(estimacion);
  const total = porVista * vistas.length;
  // El aviso de gasto y el saldo se miden sobre **el total del encargo**, como hace el servidor: por imagen,
  // seis vistas caras nunca pasarían del aviso aunque juntas sí.
  const superaUmbral = total > estimacion.umbral;
  const alcanza = estimacion.saldo === null || estimacion.saldo >= total;
  const firma = `${vistas.join(",")}|${estimacion.sello}|${porVista}|${firmaDeAvisos(confirmados)}`;

  const bloqueos = [
    ...(derechos ? [] : [FALTA_DERECHOS]),
    ...(sinTerceros ? [] : [FALTA_SIN_TERCEROS]),
    ...(superaUmbral && !avisoAceptado ? [FALTA_AVISO_GASTO] : []),
    ...(alcanza ? [] : ["Tu saldo de KIE no llega para todas estas vistas."]),
    ...bloqueosDeControles(controles, confirmados),
  ];
  // Cada casilla pendiente lleva a su casilla; el resto de motivos se lee, sin sitio al que llevar.
  const idCasilla = useId();
  const problemas = problemasDeMotivos(bloqueos, {
    [FALTA_DERECHOS]: `${idCasilla}-derechos`,
    [FALTA_SIN_TERCEROS]: `${idCasilla}-sin-terceros`,
    [FALTA_AVISO_GASTO]: `${idCasilla}-aviso-gasto`,
  });

  const generar = async () => {
    clave.current = claveEstable(clave.current, firma);
    setEnviando(true);
    setError(null);
    const respuesta = await pedirVistasQueFaltan(personajeId, {
      creditosConfirmados: porVista,
      derechos,
      sinTerceros,
      avisoUmbralAceptado: avisoAceptado,
      claveIdempotencia: clave.current.valor,
      modelo: estimacion.modelo,
      selloEstimacion: estimacion.sello,
      avisosConfirmados: confirmados,
    });
    setEnviando(false);
    if (!respuesta.ok) {
      setError(
        respuesta.red
          ? `${respuesta.error} Puede que las vistas se hayan encargado: revisa el historial antes de repetirlo.`
          : respuesta.error,
      );
      return;
    }
    onEncargadas(respuesta.datos);
    onAbiertoCambio(false);
  };

  return (
    <Dialogo
      titulo={`Generar las ${vistas.length} vistas que faltan`}
      descripcion="Se creará una imagen por cada vista, a partir de lo que ya tienes de este personaje."
      abierto={abierto}
      onAbiertoCambio={onAbiertoCambio}
      tamano="md"
    >
      <div className="flex flex-col gap-4">
        <Aviso tono="info">
          Lo que salga de aquí son <strong className="font-semibold">vistas generadas</strong>, no fotos: se guardan
          marcadas como tales.{" "}
          {inventado
            ? "En un personaje inventado cuentan para el mínimo de imágenes que guía sus escenas."
            : "No cuentan para el mínimo de fotos originales."}{" "}
          Se encargan {vistas.map((v) => ETIQUETA_VISTA[v].toLowerCase()).join(", ")}.
        </Aviso>

        <PanelCoste estimacion={estimacion}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-texto-suave">
              Son {vistas.length} imágenes, así que el total estimado es{" "}
              <strong className="text-texto">{formatearCreditos(total)}</strong>. Cada una se encola y se cobra por
              separado.
            </p>
            <Casilla
              etiqueta="Tengo derecho a usar estas fotos"
              marcada={derechos}
              requisito={`${idCasilla}-derechos`}
              onCambio={setDerechos}
              deshabilitado={enviando}
            />
            <Casilla
              etiqueta="He revisado las fotos: no aparece ninguna otra persona ni ningún menor"
              descripcion={AVISO_SIN_TERCEROS}
              marcada={sinTerceros}
              requisito={`${idCasilla}-sin-terceros`}
              onCambio={setSinTerceros}
              deshabilitado={enviando}
            />
            {superaUmbral && (
              <Casilla
                etiqueta={`Sí, quiero gastar ${formatearCreditos(total)}`}
                marcada={avisoAceptado}
                requisito={`${idCasilla}-aviso-gasto`}
                onCambio={setAvisoAceptado}
                deshabilitado={enviando}
              />
            )}
          </div>
        </PanelCoste>

        <PanelAntesDeGenerar
          evaluacion={controles}
          confirmados={confirmados}
          deshabilitado={enviando}
          onConfirmar={(regla, valor) =>
            setConfirmados((antes) => (valor ? [...new Set([...antes, regla])] : antes.filter((r) => r !== regla)))
          }
        />

        {error && <Aviso tono="error">{error}</Aviso>}
        {bloqueos.length > 0 && <Alerta tipo="bloqueo" compacta anuncio="ninguno" protege elementos={problemas} />}

        <Boton
          className="self-start"
          variante="chispa"
          icono={<Sparkles className="size-4" />}
          cargando={enviando}
          disabled={bloqueos.length > 0}
          onClick={() => void generar()}
        >
          Generar las {vistas.length} vistas
        </Boton>
      </div>
    </Dialogo>
  );
}
