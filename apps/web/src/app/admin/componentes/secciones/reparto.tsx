"use client";

import { ResumenDeLoPedido, ZonaDeConsentimiento } from "@/components/ui/reparto";
import type { RepartoVista } from "@/lib/reparto";
import { faltasDelReparto, frasesDeLoPedido } from "@/lib/reparto-pantalla";
import { Muestra, Seccion } from "../seccion";

/**
 * Componentes del **reparto de dos personajes** (0.28.0): la previsualización en castellano de lo pedido y la zona
 * de claridad del consentimiento, que se usan igual en la pantalla del guion y en la de producción.
 */

const ELISABETH: RepartoVista["miembros"][number] = {
  id: "m1",
  personajeId: "p1",
  nombre: "Elisabeth",
  inventado: false,
  papel: "hablante",
  lado: "izquierda",
  mirada: "derecha",
  orden: 1,
};

const MARCOS: RepartoVista["miembros"][number] = {
  id: "m2",
  personajeId: "p2",
  nombre: "Marcos",
  inventado: false,
  papel: "hablante",
  lado: "derecha",
  mirada: "izquierda",
  orden: 2,
};

const PODCAST: RepartoVista = {
  escenaId: "muestra",
  formato: "podcast",
  grupoPodcast: "grupo-muestra",
  miembros: [ELISABETH, MARCOS],
  turnos: [
    { id: "t1", orden: 1, personajeId: "p1", nombre: "Elisabeth", texto: "¿Y esto funciona?", direccion: "con dudas" },
    { id: "t2", orden: 2, personajeId: "p2", nombre: "Marcos", texto: "Pruébalo tú.", direccion: "en tono cercano" },
  ],
  mismaVoz: false,
};

const DUALCAST: RepartoVista = {
  ...PODCAST,
  formato: "dualcast",
  grupoPodcast: null,
  miembros: [
    { ...ELISABETH, mirada: "camara" },
    { ...MARCOS, papel: "acompanante", mirada: "camara" },
  ],
};

export function SeccionReparto() {
  return (
    <Seccion
      id="reparto"
      titulo="Dos personajes"
      descripcion="Lo que se ha pedido, dicho en castellano, y el consentimiento de cada persona real que sale. El prompt no se enseña nunca: lo que se lee son frases escritas a partir del reparto guardado."
    >
      <div className="grid gap-4">
        <Muestra titulo="Podcast: dos clips con mirada cruzada">
          <div className="w-full">
            <ResumenDeLoPedido
              frases={frasesDeLoPedido(PODCAST)}
              nota="El texto que se le manda al modelo va en inglés; lo que dicen los personajes va en castellano y sin traducir."
            />
          </div>
        </Muestra>

        <Muestra titulo="Dualcast: los dos en el plano, uno habla y el otro reacciona">
          <div className="w-full">
            <ResumenDeLoPedido frases={frasesDeLoPedido(DUALCAST)} />
          </div>
        </Muestra>

        <Muestra titulo="Consentimiento por persona: quién falta y qué hacer (zona de claridad)">
          <div className="w-full">
            <ZonaDeConsentimiento
              faltas={faltasDelReparto([
                { nombre: "Elisabeth", inventado: false, impedimentos: [] },
                { nombre: "Marcos", inventado: false, impedimentos: ["Su consentimiento no está registrado."] },
              ])}
              sinFaltas="Cada persona real de esta escena tiene su consentimiento registrado."
              comoArreglarlo="Se arregla en la ficha de cada personaje, en «Personajes». Con dos personas reales hacen falta los dos consentimientos."
            />
          </div>
        </Muestra>

        <Muestra titulo="Consentimiento en orden">
          <div className="w-full">
            <ZonaDeConsentimiento
              faltas={[]}
              sinFaltas="Cada persona real de esta escena tiene su consentimiento registrado."
              comoArreglarlo=""
            />
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
