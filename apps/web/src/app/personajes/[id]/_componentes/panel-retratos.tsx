"use client";

import { Check, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { Boton } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
import { PanelAntesDeGenerar } from "@/components/ui/controles";
import { PanelCoste } from "@/components/ui/coste";
import { Aviso } from "@/components/ui/feedback";
import { VisorMedio } from "@/components/ui/media/visor-medio";
import {
  consultarControlesDeRetrato,
  consultarEstimacionDeVista,
  consultarRetratos,
  descartarRetratos,
  elegirRetrato,
  generarRetratos,
} from "@/components/ui/personajes/api-personajes";
import { bloqueosDeControles, type EvaluacionVista, firmaDeAvisos } from "@/lib/controles";
import { creditosAConfirmar, type Estimacion, formatearCreditos } from "@/lib/generacion";
import type { Medio } from "@/lib/media/tipos";
import { RETRATOS_CANDIDATOS } from "@/lib/omni";
import type { PersonajeVista } from "@/lib/personajes";

/**
 * Retratos de un personaje **inventado** (0.22.0): se generan cuatro a partir de su descripción y se elige uno.
 *
 * El coste va delante y es el de siempre: se estima un fotograma, se multiplica por los cuatro candidatos y se
 * confirma antes de encolar nada. Elegir **no cuesta**: los cuatro ya están pagados y el que no se elige se
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
  /** Clave de esta confirmación: se conserva mientras no cambie lo que se confirma, para no pagar dos veces. */
  const clave = useRef<{ firma: string; valor: string } | null>(null);

  const porRetrato = estimacion ? creditosAConfirmar(estimacion) : null;
  const total = porRetrato === null ? null : porRetrato * RETRATOS_CANDIDATOS;
  const firma = `${estimacion?.sello ?? ""}|${porRetrato}|${firmaDeAvisos(confirmados)}`;
  const bloqueos = [
    ...(derechos ? [] : ["Falta confirmar que puedes usar lo que se genere."]),
    ...(estimacion?.superaUmbral && !avisoAceptado ? ["Falta aceptar el aviso de gasto."] : []),
    ...(estimacion === null || estimacion.alcanza ? [] : ["Tu saldo del proveedor no llega para estos retratos."]),
    ...(controles ? bloqueosDeControles(controles, confirmados) : []),
  ];

  /** Pide el coste al abrir el panel de gasto: ver la ficha no tiene que consultar el saldo del proveedor. */
  const preparar = async () => {
    setOcupado(true);
    setError(null);
    const [precio, previo] = await Promise.all([
      consultarEstimacionDeVista(),
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
    setAviso("Ese retrato es ya la cara del personaje. Desde sus referencias puedes generar las demás vistas.");
  };

  return (
    <section className="flex flex-col gap-5 rounded-tarjeta border-2 border-borde bg-superficie p-5">
      <div>
        <h2 className="text-xl font-bold text-texto">Retratos</h2>
        <p className="mt-1 text-texto-suave">
          Este personaje es inventado: su cara se genera a partir de su descripción. Se hacen {RETRATOS_CANDIDATOS} y
          eliges uno; los demás se quedan en tu biblioteca.
        </p>
      </div>

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
                Elegir este
              </Boton>
            </div>
          ))}
        </div>
      )}

      {estimacion === null ? (
        <Boton
          variante="secundario"
          className="self-start"
          cargando={ocupado}
          onClick={() => {
            void preparar();
            void recargarCandidatos();
          }}
        >
          Ver lo que cuesta generar {RETRATOS_CANDIDATOS} retratos
        </Boton>
      ) : (
        <PanelCoste estimacion={estimacion}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-texto-suave">
              Son {RETRATOS_CANDIDATOS} imágenes, así que el total estimado es{" "}
              <strong className="text-texto">{total === null ? "—" : formatearCreditos(total)}</strong>. Cada una se
              encola y se cobra por separado.
            </p>
            <Casilla
              etiqueta="Puedo usar lo que se genere con esta descripción"
              marcada={derechos}
              onCambio={setDerechos}
              deshabilitado={ocupado}
            />
            {estimacion.superaUmbral && (
              <Casilla
                etiqueta={`Sí, quiero gastar ${total === null ? "" : formatearCreditos(total)}`}
                marcada={avisoAceptado}
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
          {bloqueos.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm text-texto-suave">
              {bloqueos.map((motivo) => (
                <li key={motivo}>{motivo}</li>
              ))}
            </ul>
          )}
          <Boton
            variante="chispa"
            className="self-start"
            icono={<Sparkles className="size-4" />}
            cargando={ocupado}
            disabled={bloqueos.length > 0}
            onClick={() => void generar()}
          >
            Generar {RETRATOS_CANDIDATOS} retratos
          </Boton>
        </>
      )}
    </section>
  );
}
