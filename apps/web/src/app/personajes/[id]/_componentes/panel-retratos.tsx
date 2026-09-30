"use client";

import { Check, Sparkles } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Alerta } from "@/components/ui/alerta";
import { Boton } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
import { PanelAntesDeGenerar } from "@/components/ui/controles";
import { PanelCoste } from "@/components/ui/coste";
import { Aviso } from "@/components/ui/feedback";
import { VisorMedio } from "@/components/ui/media/visor-medio";
import {
  consultarControlesDeRetrato,
  consultarEstimacionSinImagen,
  consultarRetratos,
  descartarRetratos,
  elegirRetrato,
  generarRetratos,
} from "@/components/ui/personajes/api-personajes";
import { Selector } from "@/components/ui/select";
import { bloqueosDeControles, type EvaluacionVista, firmaDeAvisos } from "@/lib/controles";
import { creditosAConfirmar, type Estimacion, formatearCreditos } from "@/lib/generacion";
import { problemasDeMotivos } from "@/lib/llevar-al-problema";
import type { Medio } from "@/lib/media/tipos";
import { RETRATOS_CANDIDATOS } from "@/lib/omni";
import type { PersonajeVista } from "@/lib/personajes";

const OPCIONES_CANTIDAD = Array.from({ length: RETRATOS_CANDIDATOS }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

/** Motivos que corresponden a una casilla: con ellos la alerta lleva a la casilla pendiente. */
const FALTA_DERECHOS = "Falta confirmar que puedes usar lo que se genere.";
const FALTA_AVISO_GASTO = "Falta aceptar el aviso de gasto.";

/**
 * Retratos de un personaje **inventado** (0.22.0): se generan de uno a cuatro y se elige uno.
 *
 * El coste va delante y es el de siempre: se estima un fotograma, se multiplica por los cuatro candidatos y se
 * confirma antes de encolar nada. Elegir **no cuesta**: los candidatos ya están pagados y el que no se elige se
 * queda en la biblioteca de su dueño.
 *
 * El retrato elegido se guarda **marcado como vista generada**, nunca como foto: no lo es, y la ficha lo dice
 * siempre.
 */

export function PanelRetratos({
  personaje,
  medios,
  onPersonaje,
}: {
  personaje: PersonajeVista;
  /** Retratos ya generados, resueltos por la página: aquí no se consultan medios sueltos. */
  medios: Medio[];
  onPersonaje: (personaje: PersonajeVista) => void;
}) {
  const [estimacion, setEstimacion] = useState<Estimacion | null>(null);
  const [controles, setControles] = useState<EvaluacionVista | null>(null);
  const [confirmados, setConfirmados] = useState<string[]>([]);
  const [derechos, setDerechos] = useState(false);
  const [avisoAceptado, setAvisoAceptado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidatos, setCandidatos] = useState<Medio[]>(medios);
  const [cantidad, setCantidad] = useState(RETRATOS_CANDIDATOS);
  /** Clave de esta confirmación: se conserva mientras no cambie lo que se confirma, para no pagar dos veces. */
  const clave = useRef<{ firma: string; valor: string } | null>(null);

  const porRetrato = estimacion ? creditosAConfirmar(estimacion) : null;
  const total = porRetrato === null ? null : porRetrato * cantidad;
  const firma = `${estimacion?.sello ?? ""}|${porRetrato}|${cantidad}|${firmaDeAvisos(confirmados)}`;
  const bloqueos = [
    ...(derechos ? [] : [FALTA_DERECHOS]),
    ...(estimacion?.superaUmbral && !avisoAceptado ? [FALTA_AVISO_GASTO] : []),
    ...(estimacion === null || estimacion.alcanza ? [] : ["Tu saldo del proveedor no llega para estos retratos."]),
    ...(controles ? bloqueosDeControles(controles, confirmados) : []),
  ];
  // Cada casilla pendiente lleva a su casilla; el resto de motivos se lee, sin sitio al que llevar.
  const idCasilla = useId();
  const problemas = problemasDeMotivos(bloqueos, {
    [FALTA_DERECHOS]: `${idCasilla}-derechos`,
    [FALTA_AVISO_GASTO]: `${idCasilla}-aviso-gasto`,
  });

  /** Pide el coste al abrir el panel de gasto: ver la ficha no tiene que consultar el saldo del proveedor. */
  const preparar = async () => {
    setOcupado(true);
    setError(null);
    const [precio, previo] = await Promise.all([
      // Un retrato de un personaje inventado nace de su descripción: su modelo es de texto a imagen.
      consultarEstimacionSinImagen(),
      consultarControlesDeRetrato(personaje.id),
    ]);
    setOcupado(false);
    if (!precio.ok) {
      setError(precio.error);
      return;
    }
    setEstimacion(precio.datos);
    if (previo.ok) setControles(previo.datos);
  };

  const generar = async () => {
    if (!estimacion || porRetrato === null) return;
    if (clave.current?.firma !== firma) clave.current = { firma, valor: crypto.randomUUID() };
    setOcupado(true);
    setError(null);
    const respuesta = await generarRetratos(personaje.id, {
      creditosConfirmados: porRetrato,
      cantidad,
      derechos,
      avisoUmbralAceptado: avisoAceptado,
      claveIdempotencia: clave.current.valor,
      modelo: estimacion.modelo,
      selloEstimacion: estimacion.sello,
      avisosConfirmados: confirmados,
    });
    setOcupado(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    setAviso(
      `${respuesta.datos.trabajos.length} ${respuesta.datos.trabajos.length === 1 ? "retrato" : "retratos"} en marcha. Cuando terminen aparecerán aquí al recargar la página.`,
    );
    // Si no se pudieron encargar todos, el motivo se enseña: no basta con un número menor.
    if (respuesta.datos.aviso) setError(respuesta.datos.aviso);
  };

  /** Vuelve a leer los candidatos del servidor: los que ya terminaron aparecen sin recargar la página. */
  const recargarCandidatos = async () => {
    const lista = await consultarRetratos(personaje.id);
    if (!lista.ok) {
      setError(lista.error);
      return;
    }
    setCandidatos(lista.datos.candidatos);
  };

  const elegir = async (medioId: string) => {
    setOcupado(true);
    setError(null);
    const respuesta = await elegirRetrato(personaje.id, medioId);
    setOcupado(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    setCandidatos(candidatos.filter((c) => c.id !== medioId));
    onPersonaje(respuesta.datos);
    setAviso(
      personaje.estiloAnimado === "realista"
        ? "Ese retrato es ya la cara del personaje. Desde sus referencias puedes generar las demás vistas."
        : "Retrato maestro aprobado. Guiará las vistas, los clips y la comprobación de identidad de este personaje animado.",
    );
  };

  return (
    <section className="flex flex-col gap-5 rounded-tarjeta border-2 border-borde bg-superficie p-5">
      <div>
        <h2 className="text-xl font-bold text-texto">Retratos</h2>
        <p className="mt-1 text-texto-suave">
          Este personaje es inventado: su cara se genera a partir de su descripción. Puedes pedir de uno a cuatro
          retratos y elegir uno; los demás se quedan en tu biblioteca.{" "}
          {personaje.estiloAnimado !== "realista" && "El elegido será su fotograma maestro animado."}
        </p>
      </div>

      {personaje.fotogramaMaestro && (
        <div className="max-w-48">
          <p className="mb-2 text-sm font-semibold text-texto">Fotograma maestro aprobado</p>
          <VisorMedio medio={personaje.fotogramaMaestro} />
        </div>
      )}

      {error && <Aviso tono="error">{error}</Aviso>}
      {aviso && <Aviso tono="info">{aviso}</Aviso>}

      <Boton
        variante="fantasma"
        tamano="sm"
        className="self-start"
        disabled={ocupado}
        onClick={() => void recargarCandidatos()}
      >
        Buscar retratos terminados
      </Boton>

      {candidatos.length > 0 && (
        <Boton
          variante="fantasma"
          tamano="sm"
          className="self-start"
          disabled={ocupado}
          onClick={async () => {
            setOcupado(true);
            const respuesta = await descartarRetratos(personaje.id);
            setOcupado(false);
            if (!respuesta.ok) {
              setError(respuesta.error);
              return;
            }
            setCandidatos([]);
            setAviso("Retratos descartados: ya no se ofrecen como cara, pero siguen en tu biblioteca.");
          }}
        >
          Descartar los retratos pendientes
        </Boton>
      )}

      {candidatos.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {candidatos.map((medio) => (
            <div key={medio.id} className="flex flex-col gap-2">
              <VisorMedio medio={medio} />
              <Boton
                variante="secundario"
                tamano="sm"
                icono={<Check className="size-4" />}
                disabled={ocupado}
                onClick={() => void elegir(medio.id)}
              >
                {personaje.estiloAnimado === "realista" ? "Elegir este" : "Aprobar como maestro"}
              </Boton>
            </div>
          ))}
        </div>
      )}

      {estimacion === null ? (
        <div className="flex flex-col gap-3">
          <Selector
            etiqueta="Retratos que quieres generar"
            opciones={OPCIONES_CANTIDAD}
            valor={String(cantidad)}
            deshabilitado={ocupado}
            onCambio={(valor) => {
              if (valor) setCantidad(Number(valor));
            }}
          />
          <Boton
            variante="secundario"
            className="self-start"
            cargando={ocupado}
            onClick={() => {
              void preparar();
              void recargarCandidatos();
            }}
          >
            Ver lo que cuesta generar {cantidad} {cantidad === 1 ? "retrato" : "retratos"}
          </Boton>
        </div>
      ) : (
        <PanelCoste estimacion={estimacion}>
          <div className="flex flex-col gap-3">
            <Selector
              etiqueta="Retratos que quieres generar"
              opciones={OPCIONES_CANTIDAD}
              valor={String(cantidad)}
              deshabilitado={ocupado}
              onCambio={(valor) => {
                if (valor) setCantidad(Number(valor));
              }}
            />
            <p className="text-sm text-texto-suave">
              Son {cantidad} imágenes, así que el total estimado es{" "}
              <strong className="text-texto">{total === null ? "—" : formatearCreditos(total)}</strong>. Cada una se
              encola y se cobra por separado.
            </p>
            <Casilla
              etiqueta="Puedo usar lo que se genere con esta descripción"
              marcada={derechos}
              requisito={`${idCasilla}-derechos`}
              onCambio={setDerechos}
              deshabilitado={ocupado}
            />
            {estimacion.superaUmbral && (
              <Casilla
                etiqueta={`Sí, quiero gastar ${total === null ? "" : formatearCreditos(total)}`}
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

      {estimacion !== null && (
        <>
          {bloqueos.length > 0 && <Alerta tipo="bloqueo" compacta anuncio="ninguno" protege elementos={problemas} />}
          <Boton
            variante="chispa"
            className="self-start"
            icono={<Sparkles className="size-4" />}
            cargando={ocupado}
            disabled={bloqueos.length > 0}
            onClick={() => void generar()}
          >
            Generar {cantidad} {cantidad === 1 ? "retrato" : "retratos"}
          </Boton>
        </>
      )}
    </section>
  );
}
