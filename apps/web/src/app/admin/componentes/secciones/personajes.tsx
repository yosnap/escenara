"use client";

import { useState } from "react";
import { InsigniaEstadoPersonaje, SelectorPersonaje } from "@/components/ui/personaje";
import { DistintivoOrigen } from "@/components/ui/personajes/distintivo-origen";
import {
  bloqueosDeConsentimiento,
  CONSENTIMIENTO_INICIAL,
  type EstadoConsentimiento,
  FormularioConsentimiento,
} from "@/components/ui/personajes/formulario-consentimiento";
import { MarcoEnfoque } from "@/components/ui/personajes/marco-enfoque";
import {
  ACCION_MOTIVO,
  ETIQUETA_MOTIVO,
  ETIQUETA_VISTA,
  esMotivoTecnico,
  INDICACION_VISTA,
  MOTIVOS_RECHAZO,
  VISTAS,
} from "@/lib/captura-personaje";
import { ESTADOS_PERSONAJE, ORIGENES_REFERENCIA, type PersonajeElegible } from "@/lib/personajes";
import { Muestra, Seccion } from "../seccion";

/** Personajes de ejemplo, uno por estado, para ver cómo se comporta el selector con lo que no se puede usar. */
const EJEMPLOS: PersonajeElegible[] = [
  { id: "1", nombre: "Lucía", tipo: "persona", estado: "listo", totalReferencias: 5, portada: null },
  { id: "2", nombre: "Toby", tipo: "animal", estado: "borrador", totalReferencias: 1, portada: null },
  { id: "3", nombre: "Marcos", tipo: "persona", estado: "en_revision", totalReferencias: 4, portada: null },
  { id: "4", nombre: "Sara", tipo: "persona", estado: "bloqueado", totalReferencias: 6, portada: null },
];

export function SeccionPersonajes() {
  const [elegido, setElegido] = useState<string | null>("1");
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
