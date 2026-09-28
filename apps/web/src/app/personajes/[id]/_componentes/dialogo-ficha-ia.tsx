"use client";

import { Sparkles, WandSparkles } from "lucide-react";
import { useRef, useState } from "react";
import { Boton } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
import { Aviso } from "@/components/ui/feedback";
import { Dialogo } from "@/components/ui/overlay";
import {
  consultarEstimacionDeFichaIA,
  type EstimacionDeTextoVista,
  proponerFichaConIA,
} from "@/components/ui/personajes/api-personajes";
import { type ClaveConfirmacion, claveEstable } from "@/lib/asistente";
import type { PropuestaDeFicha } from "@/lib/asistente-personaje";
import { CAMPOS_FICHA, type CampoFicha, ETIQUETA_CAMPO_FICHA, type FichaPersonaje } from "@/lib/ficha-personaje";
import { formatearCreditos } from "@/lib/generacion";
import type { PersonajeVista } from "@/lib/personajes";

/**
 * «Completar la ficha con IA» (0.22.1): el modelo de texto del mapa propone los campos de la ficha y aquí se
 * revisan **uno a uno** antes de que toquen nada.
 *
 * Tres cosas se dicen siempre, antes de pulsar:
 *
 * - **qué cuesta**: los créditos de la entrada principal del mapa, o que ese servicio se paga por cuota del
 *   plan y no cuesta créditos. No se mezclan: son monedas distintas;
 * - **si se le ha enseñado la cara**: un modelo que admite imágenes describe lo que ve; uno que no, deduce de
 *   la descripción. La diferencia se nota en el resultado, así que se cuenta;
 * - **que esto no guarda nada**. Lo que se acepta rellena el formulario; la versión la crea «Guardar la ficha»,
 *   igual que cualquier otra edición.
 */
export function DialogoFichaConIA({
  personaje,
  abierto,
  onAbiertoCambio,
  onAceptar,
}: {
  personaje: PersonajeVista;
  abierto: boolean;
  onAbiertoCambio: (abierto: boolean) => void;
  /** Campos aceptados. Rellenan el formulario de la ficha: no se guardan aquí. */
  onAceptar: (campos: Partial<Record<CampoFicha, string>>) => void;
}) {
  const [estimacion, setEstimacion] = useState<EstimacionDeTextoVista | null>(null);
  const [propuesta, setPropuesta] = useState<PropuestaDeFicha | null>(null);
  const [elegidos, setElegidos] = useState<CampoFicha[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Clave de esta confirmación: se conserva mientras no cambie lo que se confirma, para no pagar dos veces. */
  const clave = useRef<ClaveConfirmacion | null>(null);

  const cuesta = estimacion !== null && !estimacion.porCuota && estimacion.creditos > 0;

  const preparar = async () => {
    setOcupado(true);
    setError(null);
    const respuesta = await consultarEstimacionDeFichaIA(personaje.id);
    setOcupado(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    setEstimacion(respuesta.datos);
    if (!respuesta.datos.hayEntradas) setError(respuesta.datos.motivo);
  };

  const pedir = async () => {
    if (!estimacion) return;
    clave.current = claveEstable(clave.current, `${estimacion.sello}|${estimacion.creditos}|${estimacion.modelo}`);
    setOcupado(true);
    setError(null);
    const respuesta = await proponerFichaConIA(personaje.id, {
      claveIdempotencia: clave.current.valor,
      ...(cuesta ? { creditosConfirmados: estimacion.creditos, selloEstimacion: estimacion.sello } : {}),
    });
    setOcupado(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    setPropuesta(respuesta.datos);
    setElegidos(CAMPOS_FICHA.filter((campo) => respuesta.datos.campos[campo] !== undefined));
  };

  const aceptar = () => {
    if (!propuesta) return;
    const campos: Partial<Record<CampoFicha, string>> = {};
    for (const campo of elegidos) {
      const valor = propuesta.campos[campo];
      if (valor !== undefined) campos[campo] = valor;
    }
    onAceptar(campos);
    onAbiertoCambio(false);
  };

  return (
    <Dialogo
      titulo="Completar la ficha con IA"
      descripcion={`Se propone la ficha de «${personaje.nombre}» a partir de su descripción.`}
      abierto={abierto}
      onAbiertoCambio={onAbiertoCambio}
      tamano="xl"
    >
      <div className="flex flex-col gap-4">
        <Aviso tono="info">
          Esto <strong className="font-semibold">no guarda nada</strong>: lo que aceptes rellena el formulario de la
          ficha, y la versión nueva la crea «Guardar la ficha», como cualquier otro cambio tuyo.
        </Aviso>

        {estimacion === null ? (
          <Boton
            className="self-start"
            variante="secundario"
            cargando={ocupado}
            onClick={() => void preparar()}
            icono={<WandSparkles className="size-4" />}
          >
            Ver con qué modelo se haría y qué cuesta
          </Boton>
        ) : (
          <CosteDeLaFicha estimacion={estimacion} />
        )}

        {error && <Aviso tono="error">{error}</Aviso>}

        {estimacion?.hayEntradas && propuesta === null && (
          <Boton
            className="self-start"
            variante="chispa"
            icono={<Sparkles className="size-4" />}
            cargando={ocupado}
            onClick={() => void pedir()}
          >
            {cuesta ? `Proponer la ficha (${formatearCreditos(estimacion.creditos)})` : "Proponer la ficha"}
          </Boton>
        )}

        {propuesta && (
          <Propuesta
            propuesta={propuesta}
            ficha={personaje.ficha}
            elegidos={elegidos}
            onElegir={(campo, valor) =>
              setElegidos((antes) => (valor ? [...new Set([...antes, campo])] : antes.filter((c) => c !== campo)))
            }
          />
        )}

        {propuesta && (
          <div className="flex flex-wrap gap-3">
            <Boton disabled={elegidos.length === 0} onClick={aceptar}>
              Aceptar {elegidos.length === 1 ? "1 campo" : `${elegidos.length} campos`}
            </Boton>
            <Boton variante="fantasma" onClick={() => onAbiertoCambio(false)}>
              No usar nada
            </Boton>
          </div>
        )}
      </div>
    </Dialogo>
  );
}

/** Lo que cuesta y con quién se escribiría. Los créditos y la cuota **no se mezclan**: son cosas distintas. */
function CosteDeLaFicha({ estimacion }: { estimacion: EstimacionDeTextoVista }) {
  if (!estimacion.hayEntradas) return null;
  return (
    <div className="flex flex-col gap-1 rounded-tarjeta border-2 border-borde bg-elevada p-4 text-sm">
      <p className="text-texto">
        La escribiría{" "}
        <strong className="font-semibold">
          {estimacion.nombreProveedor} ({estimacion.modelo})
        </strong>
        , la primera entrada de tu mapa de modelos de texto.
      </p>
      <p className="text-texto">
        {estimacion.porCuota
          ? "Ese servicio se paga por cuota de tu plan y no por petición: esta llamada no cuesta créditos."
          : `Coste estimado: ${formatearCreditos(estimacion.creditos)}.`}
      </p>
      <p className="text-texto-suave">
        {estimacion.admiteImagen
          ? "Admite imágenes, así que se le enviará también la cara del personaje."
          : "No admite imágenes, así que la propuesta saldrá solo de la descripción. Puedes poner delante un servicio que sí las admita en «Tu cuenta»."}
      </p>
    </div>
  );
}

/** La propuesta campo a campo, con lo que hay ahora al lado: aceptar a ciegas no es revisar. */
function Propuesta({
  propuesta,
  ficha,
  elegidos,
  onElegir,
}: {
  propuesta: PropuestaDeFicha;
  ficha: FichaPersonaje;
  elegidos: readonly CampoFicha[];
  onElegir: (campo: CampoFicha, valor: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-texto-suave">
        La ha escrito {propuesta.nombreProveedor} ({propuesta.modelo})
        {propuesta.deReserva && ", que es una entrada de reserva de tu mapa: la principal no pudo"}.{" "}
        {propuesta.conImagen ? "Ha visto la imagen del personaje." : propuesta.motivoSinImagen}
      </p>
      <ul className="flex flex-col gap-3">
        {CAMPOS_FICHA.map((campo) => {
          const nuevo = propuesta.campos[campo];
          if (nuevo === undefined) return null;
          const actual = ficha[campo];
          return (
            <li key={campo} className="flex flex-col gap-2 rounded-tarjeta border-2 border-borde bg-superficie p-4">
              <Casilla
                etiqueta={ETIQUETA_CAMPO_FICHA[campo]}
                marcada={elegidos.includes(campo)}
                onCambio={(valor) => onElegir(campo, valor)}
              />
              <p className="text-texto">{nuevo}</p>
              {actual.trim() !== "" && (
                <p className="text-sm text-texto-suave">
                  Ahora dice: <span className="italic">{actual}</span>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
