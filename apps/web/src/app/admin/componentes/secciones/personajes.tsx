"use client";

import { useState } from "react";
import { InsigniaEstadoPersonaje, SelectorPersonaje } from "@/components/ui/personaje";
import { CamposEstiloAnimado, type MaticesAnimados } from "@/components/ui/personajes/campos-estilo-animado";
import { DistintivoOrigen } from "@/components/ui/personajes/distintivo-origen";
import {
  bloqueosDeConsentimiento,
  CONSENTIMIENTO_INICIAL,
  type EstadoConsentimiento,
  FormularioConsentimiento,
} from "@/components/ui/personajes/formulario-consentimiento";
import { FotosRechazadas } from "@/components/ui/personajes/fotos-rechazadas";
import { MarcoEnfoque } from "@/components/ui/personajes/marco-enfoque";
import { PanelContextoPersonaje } from "@/components/ui/personajes/panel-contexto";
import {
  ACCION_MOTIVO,
  ETIQUETA_MOTIVO,
  ETIQUETA_VISTA,
  esMotivoTecnico,
  INDICACION_VISTA,
  MOTIVOS_RECHAZO,
  type RechazoDeReferencia,
  VISTAS,
} from "@/lib/captura-personaje";
import {
  type ContextoAplicado,
  ESTADOS_PERSONAJE,
  ORIGENES_REFERENCIA,
  type PersonajeElegible,
} from "@/lib/personajes";
import { Muestra, Seccion } from "../seccion";

/** Personajes de ejemplo, uno por estado, para ver cómo se comporta el selector con lo que no se puede usar. */
const EJEMPLOS: PersonajeElegible[] = [
  { id: "1", nombre: "Lucía", tipo: "persona", estado: "listo", totalReferencias: 5, portada: null, versionNumero: 3 },
  { id: "2", nombre: "Toby", tipo: "animal", estado: "borrador", totalReferencias: 1, portada: null, versionNumero: 1 },
  {
    id: "3",
    nombre: "Marcos",
    tipo: "persona",
    estado: "en_revision",
    totalReferencias: 4,
    portada: null,
    versionNumero: 2,
  },
  {
    id: "4",
    nombre: "Sara",
    tipo: "persona",
    estado: "bloqueado",
    totalReferencias: 6,
    portada: null,
    versionNumero: 5,
  },
];

/**
 * Contexto de ejemplo: la ficha de un personaje convertida en el bloque que se añade al prompt. El texto lo
 * compone siempre el servidor; aquí se muestra tal cual para poder ver la zona de claridad.
 */
const CONTEXTO: ContextoAplicado = {
  personajeId: "1",
  nombre: "Lucía",
  versionId: "v3",
  versionNumero: 3,
  conContexto: true,
  referencias: [],
  maximoDelModelo: 10,
  modelo: "nano-banana-2-lite",
};

/** Tanda de ejemplo: una foto salvable y una que no se puede saltar, para ver las dos salidas a la vez. */
const RECHAZOS: RechazoDeReferencia[] = [
  {
    medioId: "m1",
    motivos: ["resolucion"],
    bloqueante: false,
    metricas: { ancho: 320, alto: 320, nitidez: 90, luminosidad: 128, caraRelativa: 0.35 },
  },
  {
    medioId: "m2",
    motivos: ["duplicada"],
    bloqueante: true,
    metricas: { ancho: 1024, alto: 1024, nitidez: 140, luminosidad: 130, caraRelativa: 0.5 },
  },
];

export function SeccionPersonajes() {
  const [elegido, setElegido] = useState<string | null>("1");
  const [estiloAnimado, setEstiloAnimado] = useState("ilustracion-plana");
  const [maticesAnimados, setMaticesAnimados] = useState<MaticesAnimados>({
    paleta: "cobalto, coral y crema",
    trazo: "línea limpia",
    detalle: "mismo peinado y chaqueta",
    referencias: "figuras geométricas suaves",
  });
  const [consentimiento, setConsentimiento] = useState<EstadoConsentimiento>(CONSENTIMIENTO_INICIAL);
  return (
    <Seccion
      id="personajes"
      titulo="Personajes y consentimiento"
      descripcion="Estado del personaje (siempre con icono y texto, nunca solo con color), selector de «Crear» sin el desplegable nativo del navegador, la captura guiada con el marco «Enfoque» y el consentimiento en zona de claridad: superficies neutras, sin degradados ni parallax."
    >
      <div className="grid gap-4">
        <Muestra titulo="Insignias de estado">
          {ESTADOS_PERSONAJE.map((estado) => (
            <InsigniaEstadoPersonaje key={estado} estado={estado} />
          ))}
        </Muestra>
        <Muestra titulo="Selector de personaje (los que no pueden generar salen deshabilitados)">
          <div className="w-full">
            <SelectorPersonaje personajes={EJEMPLOS} valor={elegido} onCambio={setElegido} />
          </div>
        </Muestra>
        <Muestra titulo="Guía de estilo de un personaje inventado animado">
          <div className="w-full">
            <CamposEstiloAnimado
              opciones={[
                {
                  clave: "ilustracion-plana",
                  nombre: "Ilustración plana",
                  descripcion: "Color sólido y formas limpias.",
                },
                { clave: "tres-d-estilizado", nombre: "3D estilizado", descripcion: "Volúmenes suaves." },
                { clave: "anime", nombre: "Anime", descripcion: "Dibujo por capas y líneas definidas." },
              ]}
              estilo={estiloAnimado}
              onEstilo={setEstiloAnimado}
              matices={maticesAnimados}
              onMatices={setMaticesAnimados}
            />
          </div>
        </Muestra>
        <Muestra titulo="Origen de una referencia (una vista generada nunca se presenta como foto)">
          {ORIGENES_REFERENCIA.map((origen) => (
            <DistintivoOrigen key={origen} origen={origen} />
          ))}
        </Muestra>
        <Muestra titulo="Visor de la captura guiada: marco «Enfoque» con la silueta de cada vista">
          <div className="grid w-full gap-3 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]">
            {VISTAS.map((vista) => (
              <div key={vista} className="flex flex-col gap-1">
                <MarcoEnfoque vista={vista} />
                <p className="text-sm font-medium text-texto">{ETIQUETA_VISTA[vista]}</p>
                <p className="text-xs text-texto-suave">{INDICACION_VISTA[vista]}</p>
              </div>
            ))}
          </div>
        </Muestra>
        <Muestra titulo="Motivos de rechazo de una foto: cada uno con su acción concreta">
          <ul className="flex w-full flex-col gap-2">
            {MOTIVOS_RECHAZO.map((motivo) => (
              <li key={motivo} className="text-sm text-texto">
                <strong className="font-semibold">{ETIQUETA_MOTIVO[motivo]}</strong>
                {esMotivoTecnico(motivo) ? " (mínimo técnico, no se puede saltar): " : ": "}
                {ACCION_MOTIVO[motivo]}
              </li>
            ))}
          </ul>
        </Muestra>
        <Muestra titulo="Fotos que el control de calidad ha dejado fuera: cada una con su salida">
          <div className="w-full">
            <FotosRechazadas
              rechazos={RECHAZOS}
              medios={[]}
              ocupado={false}
              onUsarDeTodasFormas={() => {}}
              onSeguirSinEllas={() => {}}
            />
          </div>
        </Muestra>
        <Muestra titulo="Contexto que se enviará al modelo (zona de claridad)">
          <div className="w-full">
            <PanelContextoPersonaje contexto={CONTEXTO} />
          </div>
        </Muestra>
        <Muestra titulo="Consentimiento (zona de claridad)">
          <div className="flex w-full flex-col gap-3">
            <FormularioConsentimiento valor={consentimiento} onCambio={setConsentimiento} />
            <ul className="flex list-inside list-disc flex-col gap-1 text-sm text-texto-suave">
              {bloqueosDeConsentimiento(consentimiento).map((motivo) => (
                <li key={motivo}>{motivo}</li>
              ))}
            </ul>
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
