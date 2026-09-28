"use client";

import { Grid3x3, RefreshCw, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Boton } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
import { PanelAntesDeGenerar } from "@/components/ui/controles";
import { PanelCoste } from "@/components/ui/coste";
import { Aviso } from "@/components/ui/feedback";
import { VisorMedio } from "@/components/ui/media/visor-medio";
import {
  cambiarEstadoDeHoja,
  consultarControlesDeHoja,
  consultarEstimacionDeVista,
  generarHojaDeIdentidad,
} from "@/components/ui/personajes/api-personajes";
import { bloqueosDeControles, type EvaluacionVista, firmaDeAvisos } from "@/lib/controles";
import { NOMBRE_ESTADO_HOJA_IDENTIDAD, RETRATOS_HOJA_IDENTIDAD } from "@/lib/direccion";
import { creditosAConfirmar, type Estimacion, formatearCreditos } from "@/lib/generacion";
import type { Medio } from "@/lib/media/tipos";
import type { PersonajeVista } from "@/lib/personajes";

/**
 * **Hoja de identidad 3×3** de un personaje (0.25.0): una imagen con nueve retratos suyos desde ángulos y
 * expresiones distintas, para dársela al modelo como referencia en vez de sus fotos sueltas.
 *
 * El dinero va por delante y es el de siempre: cuesta **un fotograma**, se estima, se confirma y pasa por el
 * motor de controles antes de encolar nada. No hay ningún atajo aquí.
 *
 * Lo que la pantalla deja claro, porque es lo que decide: la hoja nace **candidata** y **no se usa** hasta que
 * su dueño lo diga. Puede probarla en la mitad de sus escenas (interruptor de la pestaña «Ficha»), hacerla la
 * referencia por defecto o descartarla.
 */
export function PanelHojaIdentidad({
  personaje,
  hoja,
  onPersonaje,
}: {
  personaje: PersonajeVista;
  /** La hoja ya generada, resuelta por la página; `null` si todavía no hay ninguna. */
  hoja: Medio | null;
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
  const clave = useRef<{ firma: string; valor: string } | null>(null);

  const creditos = estimacion ? creditosAConfirmar(estimacion) : null;
  const firma = `${estimacion?.sello ?? ""}|${creditos}|${firmaDeAvisos(confirmados)}`;
  const bloqueos = [
    ...(derechos ? [] : ["Falta confirmar que puedes usar lo que se genere."]),
    ...(estimacion?.superaUmbral && !avisoAceptado ? ["Falta aceptar el aviso de gasto."] : []),
    ...(estimacion === null || estimacion.alcanza ? [] : ["Tu saldo del proveedor no llega para esta hoja."]),
    ...(controles ? bloqueosDeControles(controles, confirmados) : []),
  ];

  /** El coste se pide **al abrir** el panel, no al cargar la ficha: ver un personaje no consulta saldos. */
  const preparar = async () => {
    setOcupado(true);
    setError(null);
    const [precio, previo] = await Promise.all([consultarEstimacionDeVista(), consultarControlesDeHoja(personaje.id)]);
    setOcupado(false);
    if (!precio.ok) {
      setError(precio.error);
      return;
    }
    setEstimacion(precio.datos);
    if (previo.ok) setControles(previo.datos);
  };

  const generar = async () => {
    if (!estimacion || creditos === null) return;
    if (clave.current?.firma !== firma) clave.current = { firma, valor: crypto.randomUUID() };
    setOcupado(true);
    setError(null);
    const respuesta = await generarHojaDeIdentidad(personaje.id, {
      creditosConfirmados: creditos,
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
    setAviso(`${respuesta.datos.aviso} Cuando termine aparecerá aquí al recargar la página.`);
  };

  const cambiar = async (estado: "por_defecto" | "descartada") => {
    setOcupado(true);
    setError(null);
    const respuesta = await cambiarEstadoDeHoja(personaje.id, estado);
    setOcupado(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    onPersonaje(respuesta.datos);
    setAviso(
      estado === "por_defecto"
        ? "La hoja es ya la referencia de este personaje: sus escenas se generarán con ella."
        : "Hoja descartada: sus escenas vuelven a generarse con sus fotos. La imagen sigue en tu biblioteca.",
    );
  };

  const estado = personaje.hojaIdentidad?.estado ?? null;

  return (
    <section className="flex flex-col gap-5 rounded-tarjeta border-2 border-borde bg-superficie p-5">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-texto">
          <Grid3x3 className="size-5 text-acento" />
          Hoja de identidad
        </h2>
        <p className="mt-1 text-texto-suave">
          Una sola imagen con {RETRATOS_HOJA_IDENTIDAD} retratos de «{personaje.nombre}» desde ángulos y expresiones
          distintas. Sirve para darle al modelo su cara desde varios lados a la vez, en lugar de sus fotos sueltas.{" "}
          <strong className="text-texto">Nace como candidata y no se usa sola</strong>: eres tú quien decide si la
          pruebas o la haces la referencia del personaje.
        </p>
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}
      {aviso && <Aviso tono="info">{aviso}</Aviso>}

      {hoja && (
        <div className="flex flex-col gap-3">
          <VisorMedio medio={hoja} />
          <p className="text-sm text-texto-suave">
            Estado: <strong className="text-texto">{estado ? NOMBRE_ESTADO_HOJA_IDENTIDAD[estado] : "—"}</strong>
            {personaje.probarHojaIdentidad && " · En prueba en la mitad de tus escenas."}
          </p>
          <div className="flex flex-wrap gap-2">
            {estado !== "por_defecto" && (
              <Boton variante="secundario" tamano="sm" disabled={ocupado} onClick={() => void cambiar("por_defecto")}>
                Usarla siempre en este personaje
              </Boton>
            )}
            {estado !== "descartada" && (
              <Boton
                variante="fantasma"
                tamano="sm"
                icono={<Trash2 className="size-4" />}
                disabled={ocupado}
                onClick={() => void cambiar("descartada")}
              >
                Descartarla
              </Boton>
            )}
          </div>
        </div>
      )}

      {/* Generar exige poder generar: consentimiento vigente y fotos suficientes. Lo dice el motor, no esto. */}
      {!personaje.puedeGenerar && (
        <Aviso tono="info">
          Este personaje todavía no puede generar, así que tampoco su hoja.{" "}
          {personaje.impedimentos.join(" ") || "Revisa su consentimiento y sus fotos."}
        </Aviso>
      )}

      {personaje.puedeGenerar &&
        (estimacion === null ? (
          <Boton
            variante="secundario"
            className="self-start"
            icono={hoja ? <RefreshCw className="size-4" /> : <Grid3x3 className="size-4" />}
            cargando={ocupado}
            onClick={() => void preparar()}
          >
            {hoja ? "Ver lo que cuesta rehacerla" : "Ver lo que cuesta generarla"}
          </Boton>
        ) : (
          <PanelCoste estimacion={estimacion}>
            <div className="flex flex-col gap-3">
              <p className="text-sm text-texto-suave">
                Es una imagen, así que cuesta lo mismo que un fotograma:{" "}
                <strong className="text-texto">{creditos === null ? "—" : formatearCreditos(creditos)}</strong>.
              </p>
              <Casilla
                etiqueta="Puedo usar lo que se genere con las fotos de este personaje"
                marcada={derechos}
                onCambio={setDerechos}
                deshabilitado={ocupado}
              />
              {estimacion.superaUmbral && (
                <Casilla
                  etiqueta={`Sí, quiero gastar ${creditos === null ? "" : formatearCreditos(creditos)}`}
                  marcada={avisoAceptado}
                  onCambio={setAvisoAceptado}
                  deshabilitado={ocupado}
                />
              )}
            </div>
          </PanelCoste>
        ))}

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
        <div className="flex flex-col gap-2">
          {bloqueos.map((motivo) => (
            <p key={motivo} className="text-sm text-texto-suave">
              {motivo}
            </p>
          ))}
          <Boton
            className="self-start"
            cargando={ocupado}
            disabled={bloqueos.length > 0}
            onClick={() => void generar()}
          >
            Generar la hoja
          </Boton>
        </div>
      )}
    </section>
  );
}
