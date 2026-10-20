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
  consultarHuecos,
  consultarRetratos,
  descartarRetratos,
  elegirRetrato,
  generarRetratos,
} from "@/components/ui/personajes/api-personajes";
import { Selector } from "@/components/ui/select";
import { bloqueosDeControles, type EvaluacionVista, firmaDeAvisos } from "@/lib/controles";
import {
  creditosAConfirmar,
  type Estimacion,
  formatearCreditos,
  type HuecosDeCola,
  motivoSinHuecos,
} from "@/lib/generacion";
import { problemasDeMotivos } from "@/lib/llevar-al-problema";
import type { Medio } from "@/lib/media/tipos";
import { rangoDeRetratos, retratosPorEncargo } from "@/lib/omni";
import type { PersonajeVista } from "@/lib/personajes";

/** De uno al máximo que se puede encargar ahora: nunca se ofrece un número que la cola rechazaría. */
const opcionesCantidad = (maximo: number) =>
  Array.from({ length: Math.max(1, maximo) }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

/** Lo más que se puede pedir de una vez: los candidatos, sin pasar del tope de trabajos simultáneos. */
const topeDeRetratos = (huecos: HuecosDeCola | null) => retratosPorEncargo(huecos?.maximo ?? null);

/** Lo que cabe ahora en la cola, de uno al tope; sin huecos conocidos, el tope. */
const cabenAhora = (huecos: HuecosDeCola | null) =>
  huecos === null ? topeDeRetratos(null) : Math.max(1, Math.min(topeDeRetratos(huecos), huecos.libres));

/** Motivos que corresponden a una casilla: con ellos la alerta lleva a la casilla pendiente. */
const FALTA_DERECHOS = "Falta confirmar que puedes usar lo que se genere.";
const FALTA_AVISO_GASTO = "Falta aceptar el aviso de gasto.";

/**
 * Retratos de un personaje **inventado** (0.22.0): se generan de uno a los que quepan de una vez (los candidatos, sin
 * pasar del tope de trabajos simultáneos) y se elige uno.
 *
 * El coste va delante y es el de siempre: se estima un fotograma, se multiplica por los retratos pedidos y se
 * confirma antes de encolar nada. Elegir **no cuesta**: los candidatos ya están pagados y el que no se elige se
 * queda en la biblioteca de su dueño.
 *
 * El retrato elegido se guarda **marcado como vista generada**, nunca como foto: no lo es, y la ficha lo dice
 * siempre.
 */

export function PanelRetratos({
  personaje,
  medios,
  huecosIniciales,
  onPersonaje,
}: {
  personaje: PersonajeVista;
  /** Retratos ya generados, resueltos por la página: aquí no se consultan medios sueltos. */
  medios: Medio[];
  /**
   * Huecos de la cola al cargar la ficha, leídos por la página: el número de retratos parte de lo que cabe, también
   * al recargar o al volver a la pestaña justo después de un encargo. `null` si no se han podido leer.
   */
  huecosIniciales: HuecosDeCola | null;
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
  /** Lo que ha elegido la persona; `null` = los que quepan. */
  const [elegida, setElegida] = useState<number | null>(null);
  /** Huecos de la cola: los de la página, puestos al día al preparar el gasto, al encargar y al buscar terminados. */
  const [huecos, setHuecos] = useState<HuecosDeCola | null>(huecosIniciales);
  // Al refrescarse la página (al elegir la cara, por ejemplo) llegan huecos nuevos: mandan sobre los de antes.
  const [huecosDeLaPagina, setHuecosDeLaPagina] = useState(huecosIniciales);
  if (huecosIniciales !== huecosDeLaPagina) {
    setHuecosDeLaPagina(huecosIniciales);
    setHuecos(huecosIniciales);
  }
  const tope = topeDeRetratos(huecos);
  /**
   * El número que se pide se **deriva**: lo elegido (o el tope) sin pasar de lo que cabe ahora. Así no salta a un número
   * cualquiera al encargar, al buscar terminados o al volver a la pestaña: es siempre lo elegido, recortado a la cola, y
   * cuando se recorta se dice por qué.
   */
  const cantidad = Math.min(elegida ?? tope, cabenAhora(huecos));
  const recortadoPorLaCola = huecos !== null && huecos.libres > 0 && huecos.libres < tope;
  /** Lo que se acaba de encargar, junto al botón: es donde está mirando quien lo ha pulsado. */
  const [encargo, setEncargo] = useState<{ texto: string; faltan: string; reserva: string } | null>(null);
  const opciones = opcionesCantidad(cabenAhora(huecos));
  /** Clave de esta confirmación: se conserva mientras no cambie lo que se confirma, para no pagar dos veces. */
  const clave = useRef<{ firma: string; valor: string } | null>(null);

  const porRetrato = estimacion ? creditosAConfirmar(estimacion) : null;
  const total = porRetrato === null ? null : porRetrato * cantidad;
  const firma = `${estimacion?.sello ?? ""}|${porRetrato}|${cantidad}|${firmaDeAvisos(confirmados)}`;
  const bloqueos = [
    ...(derechos ? [] : [FALTA_DERECHOS]),
    ...(estimacion?.superaUmbral && !avisoAceptado ? [FALTA_AVISO_GASTO] : []),
    ...(estimacion === null || estimacion.alcanza ? [] : ["Tu saldo del proveedor no llega para estos retratos."]),
    ...(huecos !== null && huecos.libres === 0
      ? [`${motivoSinHuecos(huecos)} Espera a que termine alguno para pedir retratos.`]
      : []),
    ...(controles ? bloqueosDeControles(controles, confirmados) : []),
  ];
  // Cada casilla pendiente lleva a su casilla; el resto de motivos se lee, sin sitio al que llevar.
  const idCasilla = useId();
  const problemas = problemasDeMotivos(bloqueos, {
    [FALTA_DERECHOS]: `${idCasilla}-derechos`,
    [FALTA_AVISO_GASTO]: `${idCasilla}-aviso-gasto`,
  });

  /** Cuando la cola recorta lo que se puede pedir, se dice junto al selector: el número no cambia sin motivo. */
  const avisoRecorte =
    huecos !== null && recortadoPorLaCola ? (
      <Aviso tono="aviso">
        Ahora puedes encargar como máximo {huecos.libres} {huecos.libres === 1 ? "retrato" : "retratos"}:{" "}
        {motivoSinHuecos(huecos).toLowerCase()} Cuando termine alguno podrás pedir más.
      </Aviso>
    ) : null;

  /** Pide el coste al abrir el panel de gasto: ver la ficha no tiene que consultar el saldo del proveedor. */
  const preparar = async () => {
    setOcupado(true);
    setError(null);
    const [precio, previo, cola] = await Promise.all([
      // Un retrato de un personaje inventado nace de su descripción: su modelo es de texto a imagen.
      consultarEstimacionSinImagen(),
      consultarControlesDeRetrato(personaje.id),
      consultarHuecos(),
    ]);
    setOcupado(false);
    if (!precio.ok) {
      setError(precio.error);
      return;
    }
    if (!cola.ok) {
      setError(cola.error);
      return;
    }
    // Lo elegido se recorta solo a lo que cabe: el número que se confirma es el que se encarga.
    setHuecos(cola.datos);
    setEstimacion(precio.datos);
    if (previo.ok) setControles(previo.datos);
  };

  const generar = async () => {
    if (!estimacion || porRetrato === null) return;
    if (clave.current?.firma !== firma) clave.current = { firma, valor: crypto.randomUUID() };
    setOcupado(true);
    setError(null);
    setEncargo(null);
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
    const hechos = respuesta.datos.trabajos.length;
    // Si no se pudieron encargar todos, el motivo se enseña: no basta con un número menor.
    setEncargo({
      texto: `Se ${hechos === 1 ? "ha" : "han"} encargado ${hechos} de ${cantidad} ${cantidad === 1 ? "retrato" : "retratos"}. Cuando terminen aparecerán aquí al pulsar «Buscar retratos terminados» o al recargar la página.`,
      faltan: respuesta.datos.aviso,
      // Si la traducción la escribió una reserva de pago, se dice quién y cuánto costó (es el mismo en todos).
      reserva: respuesta.datos.trabajos.find((t) => t.avisoReserva)?.avisoReserva ?? "",
    });
    const despues =
      huecos === null
        ? null
        : { ...huecos, enMarcha: huecos.enMarcha + hechos, libres: Math.max(0, huecos.libres - hechos) };
    setHuecos(despues);
    // El encargo queda cerrado: su coste, sus casillas y sus comprobaciones eran de **este** gasto. Dejarlos abiertos
    // enseñaría como bloqueo la cola que se acaba de llenar con él; el siguiente encargo vuelve a leer coste y cola.
    setEstimacion(null);
    setControles(null);
    setConfirmados([]);
    setDerechos(false);
    setAvisoAceptado(false);
    clave.current = null;
  };

  /** Vuelve a leer los candidatos del servidor: los que ya terminaron aparecen sin recargar la página. */
  const recargarCandidatos = async () => {
    const [lista, cola] = await Promise.all([consultarRetratos(personaje.id), consultarHuecos()]);
    if (!lista.ok) {
      setError(lista.error);
      return;
    }
    setCandidatos(lista.datos.candidatos);
    // Lo que ha terminado deja sitio en la cola: el número que se ofrece se ajusta a la cola de ahora.
    if (cola.ok) setHuecos(cola.datos);
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
          Este personaje es inventado: su cara se genera a partir de su descripción. Puedes pedir{" "}
          {tope === 1 ? "un retrato cada vez" : `${rangoDeRetratos(tope)} a la vez`} y elegir uno; los demás se quedan
          en tu biblioteca. {personaje.estiloAnimado !== "realista" && "El elegido será su fotograma maestro animado."}
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

      {estimacion === null && huecos !== null && huecos.libres === 0 ? (
        // Cola llena: no se ofrece ningún retrato, ni siquiera uno, y se dice por qué y cuándo se podrá.
        <Aviso tono="aviso">
          Ahora no cabe ningún retrato más: {motivoSinHuecos(huecos).toLowerCase()} Cuando termine alguno, pulsa «Buscar
          retratos terminados» y podrás pedir más.
        </Aviso>
      ) : estimacion === null ? (
        <div className="flex flex-col gap-3">
          <Selector
            etiqueta="Retratos que quieres generar"
            opciones={opciones}
            valor={String(cantidad)}
            deshabilitado={ocupado}
            onCambio={(valor) => {
              if (valor) setElegida(Number(valor));
            }}
          />
          {avisoRecorte}
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
              opciones={opciones}
              valor={String(cantidad)}
              deshabilitado={ocupado}
              onCambio={(valor) => {
                if (valor) setElegida(Number(valor));
              }}
            />
            {avisoRecorte}
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

      {encargo && <Aviso tono="correcto">{encargo.texto}</Aviso>}
      {encargo?.faltan && <Aviso tono="aviso">{encargo.faltan}</Aviso>}
      {encargo?.reserva && <Aviso tono="aviso">{encargo.reserva}</Aviso>}
    </section>
  );
}
