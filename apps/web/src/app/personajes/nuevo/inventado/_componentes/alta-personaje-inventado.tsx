"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alerta } from "@/components/ui/alerta";
import { Boton } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { Paso } from "@/components/ui/paso";
import { crearPersonajeInventado } from "@/components/ui/personajes/api-personajes";
import {
  CamposEstiloAnimado,
  type MaticesAnimados,
  type OpcionEstiloAnimado,
} from "@/components/ui/personajes/campos-estilo-animado";
import { nombresRealesEn } from "@/lib/nombres-reales";
import { DECLARACION_PERSONAJE_INVENTADO, MOTIVO_SIN_FOTOS_REALES } from "@/lib/omni";
import { DESCRIPCION_MAXIMA, NOMBRE_MAXIMO } from "@/lib/personajes";

/** Descripción mínima para que los retratos salgan de algo y no de una línea suelta. La misma que el servidor. */
const DESCRIPCION_MINIMA = 20;

/**
 * Alta de un personaje inventado: nombre, descripción y declaración. Nada más, porque nada más hace falta: sus
 * retratos se generan después desde su ficha, con su coste delante.
 *
 * El aviso de nombres reales aparece **mientras se escribe**, con la misma lista que aplica el servidor: no es
 * una validación distinta, es la misma dicha antes de pulsar.
 */
export function AltaPersonajeInventado({
  estilos,
  descripcionInicial = "",
}: {
  estilos: OpcionEstiloAnimado[];
  /** Descripción de partida al inspirarse en un personaje de la comunidad (solo el texto, nunca sus imágenes). */
  descripcionInicial?: string;
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState(descripcionInicial);
  const [declaracion, setDeclaracion] = useState(false);
  const [estilo, setEstilo] = useState("realista");
  const [matices, setMatices] = useState<MaticesAnimados>({ paleta: "", trazo: "", detalle: "", referencias: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nombreLimpio = nombre.trim();
  const descripcionLimpia = descripcion.trim();
  const reales = nombresRealesEn(`${nombreLimpio} ${descripcionLimpia}`);
  const referencias = matices.referencias
    .split("\n")
    .map((linea) => linea.trim())
    .filter(Boolean);
  const bloqueos = [
    ...(nombreLimpio === "" ? ["Falta el nombre del personaje."] : []),
    ...(descripcionLimpia.length < DESCRIPCION_MINIMA
      ? [`Descríbelo con al menos ${DESCRIPCION_MINIMA} caracteres: de ahí salen sus retratos.`]
      : []),
    ...(reales.length > 0 ? ["El texto nombra a una persona real."] : []),
    ...(declaracion ? [] : ["Falta la declaración de que es un personaje inventado."]),
    ...(referencias.length > 3 ? ["La guía admite hasta tres referencias descriptivas."] : []),
  ];

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const creado = await crearPersonajeInventado({
      nombre: nombreLimpio,
      descripcion: descripcionLimpia,
      declaracion,
      estiloAnimado: estilo,
      ...(estilo === "realista"
        ? {}
        : {
            guiaPaleta: matices.paleta,
            guiaTrazo: matices.trazo,
            guiaDetalle: matices.detalle,
            guiaReferencias: referencias,
          }),
    });
    setGuardando(false);
    if (!creado.ok) {
      setError(creado.error);
      return;
    }
    router.push(`/personajes/${creado.datos.id}`);
  };

  return (
    <div className="flex flex-col gap-8">
      <Paso numero={1} titulo="¿Cómo es?">
        <Campo etiqueta="Nombre" ayuda={`Cómo lo vas a reconocer en tu lista. Hasta ${NOMBRE_MAXIMO} caracteres.`}>
          {(props) => (
            <EntradaTexto
              {...props}
              value={nombre}
              maxLength={NOMBRE_MAXIMO}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nora"
            />
          )}
        </Campo>
        <Campo
          etiqueta="Descripción"
          ayuda="De aquí salen sus retratos y el contexto de cada escena: edad aproximada, pelo, complexión, ropa y gesto. No nombres a personas reales ni pidas que se parezca a alguien."
        >
          {(props) => (
            <AreaTexto
              {...props}
              value={descripcion}
              maxLength={DESCRIPCION_MAXIMA}
              onChange={(e) => setDescripcion(e.target.value)}
              className="min-h-32"
              placeholder="Mujer de unos treinta años, pelo corto castaño, chaqueta vaquera y gesto tranquilo."
            />
          )}
        </Campo>
        {reales.length > 0 && (
          <Aviso tono="error">
            El texto nombra a {reales.join(", ")}. Un personaje inventado no puede describirse por su parecido con
            alguien real: descríbelo por su aspecto.
          </Aviso>
        )}
      </Paso>

      <Paso numero={2} titulo="Estilo visual">
        <CamposEstiloAnimado
          opciones={estilos}
          estilo={estilo}
          onEstilo={setEstilo}
          matices={matices}
          onMatices={setMatices}
        />
      </Paso>

      <Paso numero={3} titulo="Declaración">
        <Aviso tono="info">{MOTIVO_SIN_FOTOS_REALES}</Aviso>
        <Casilla
          etiqueta={DECLARACION_PERSONAJE_INVENTADO}
          descripcion="Queda registrada con tu cuenta y la fecha. Es un control del producto, no una verificación: Escenara no puede comprobar a quién se parece una cara generada."
          marcada={declaracion}
          onCambio={setDeclaracion}
          deshabilitado={guardando}
        />
      </Paso>

      <Paso numero={4} titulo="Y después">
        <div className="flex flex-col gap-4 rounded-tarjeta border border-borde bg-superficie p-5">
          <p className="text-texto-suave">
            Al crearlo irás a su ficha, donde se generan <strong className="text-texto">cuatro retratos</strong> a
            partir de esta descripción. Verás lo que cuesta antes de generarlos y eliges el que te convenza; el resto se
            queda en tu biblioteca. De ese retrato salen después sus vistas.
          </p>
          {bloqueos.length > 0 && (
            <Alerta
              tipo="bloqueo"
              compacta
              anuncio="ninguno"
              protege
              elementos={bloqueos.map((texto) => ({ texto }))}
            />
          )}
          {error && <Aviso tono="error">{error}</Aviso>}
          <Boton
            variante="chispa"
            icono={<Check className="size-5" />}
            className="self-start"
            cargando={guardando}
            disabled={bloqueos.length > 0}
            onClick={() => void guardar()}
          >
            Crear el personaje inventado
          </Boton>
        </div>
      </Paso>
    </div>
  );
}
