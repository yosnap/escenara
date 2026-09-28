"use client";

import { useState } from "react";
import {
  ElectorDeAngulos,
  PanelAnguloFiel,
  ResumenDeOferta,
  SelectorDeAngulo,
  ZonaDeDeclaracion,
} from "@/components/ui/anuncio";
import type { AnguloVista, OfertaVista } from "@/lib/anuncio";
import { AVISO_DECLARACION_NECESARIA } from "@/lib/anuncio";
import type { AnguloParaVariante } from "@/lib/anuncio-pantalla";
import type { DecisionVista } from "@/lib/coherencia";
import { Muestra, Seccion } from "../seccion";

/** Componentes de la estrategia del anuncio (0.27.0): el ángulo, la oferta, la declaración y el veredicto. */

const ANGULOS: AnguloVista[] = [
  {
    clave: "problema-dolor",
    nombre: "Problema / dolor",
    definicion: "Entra por lo que le molesta cada día y lo nombra tal como lo vive.",
    porDondeEntra: "Lo que le molesta cada día",
    ejemplo: "El encrespado que aparece a los diez minutos de salir de casa.",
    exigeDeclaracion: false,
  },
  {
    clave: "mecanismo",
    nombre: "Mecanismo",
    definicion: "Entra por la causa oculta: explica por qué pasa lo que le pasa.",
    porDondeEntra: "El porqué, la causa oculta",
    ejemplo: "El culpable son los sulfatos del champú de siempre.",
    exigeDeclaracion: true,
  },
];

const PARA_VARIANTES: AnguloParaVariante[] = [
  { angulo: ANGULOS[0] as AnguloVista, elegible: true, motivo: "", exigeDeclaracion: false },
  {
    angulo: ANGULOS[1] as AnguloVista,
    elegible: false,
    motivo: "Ya hay un anuncio de este grupo con este ángulo.",
    exigeDeclaracion: true,
  },
];

const OFERTA: OfertaVista = {
  id: "muestra",
  productoId: "muestra",
  productoNombre: "Champú para pelo rizado",
  queSeDa: "Un bote de 300 ml que dura un mes, con su guía de uso.",
  precio: "19,90 €",
  garantia: "Devolución de 30 días sin preguntas.",
  urgencia: "",
  bonus: "",
  creado: "2026-09-28T10:00:00.000Z",
};

const VEREDICTO: DecisionVista = {
  id: "muestra",
  comprobacion: "angulo_fiel",
  nombre: "Fidelidad al ángulo del anuncio",
  modo: "sombra",
  veredicto: "revisar",
  evidencia: "El guion arranca por el problema, pero la escena 3 mete el precio y la comparación con la peluquería.",
  confianza: 0.72,
  umbral: 0.8,
  modeloDecision: "typesafe",
  modeloPercepcion: "",
  correccion: null,
  fecha: "2026-09-28T10:00:00.000Z",
};

export function SeccionAnuncio() {
  const [elegido, setElegido] = useState("problema-dolor");
  const [elegidos, setElegidos] = useState<string[]>(["problema-dolor"]);
  const [aceptada, setAceptada] = useState(false);

  return (
    <Seccion
      id="anuncio"
      titulo="Estrategia del anuncio"
      descripcion="El ángulo se elige leyendo por dónde entra y su ejemplo, así que son tarjetas y no un desplegable. Lo que se firma y lo que cuesta van en zonas de claridad: borde neutro, sin degradado y sin movimiento."
    >
      <div className="flex flex-col gap-5">
        <Muestra titulo="Elegir el ángulo (uno solo)">
          <div className="w-full">
            <SelectorDeAngulo angulos={ANGULOS} elegido={elegido} onElegir={setElegido} />
          </div>
        </Muestra>

        <Muestra titulo="Ángulos de una tanda de variantes (varios, con motivo si no se puede)">
          <div className="w-full">
            <ElectorDeAngulos angulos={PARA_VARIANTES} elegidos={elegidos} onCambio={setElegidos} />
          </div>
        </Muestra>

        <Muestra titulo="La oferta: lo que dirá y lo que no">
          <div className="w-full">
            <ResumenDeOferta oferta={OFERTA} />
          </div>
        </Muestra>

        <Muestra titulo="Declaración de veracidad (zona de claridad)">
          <div className="w-full">
            <ZonaDeDeclaracion
              nombreAngulo="Mecanismo"
              aviso={AVISO_DECLARACION_NECESARIA}
              registrada={false}
              aceptada={aceptada}
              onAceptar={setAceptada}
            />
          </div>
        </Muestra>

        <Muestra titulo="Veredicto del ángulo, en sombra, con corrección humana">
          <div className="w-full">
            <PanelAnguloFiel
              decision={VEREDICTO}
              motivo=""
              enSombra
              ocupado={false}
              onComprobar={() => undefined}
              onCorregir={() => undefined}
            />
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
