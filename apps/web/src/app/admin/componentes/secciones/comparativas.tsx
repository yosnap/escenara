"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { TarjetaCalibracion } from "@/components/ui/calibracion";
import {
  AvisoSinGenerar,
  TablaComparativa,
  TarjetaModeloComparable,
} from "@/components/ui/comparativas/comparar-modelos";
import { ConfirmacionAB } from "@/components/ui/comparativas/confirmacion-ab";
import { ResultadosAB } from "@/components/ui/comparativas/resultados-ab";
import type { CalibracionVista } from "@/lib/calibracion";
import type { ComparativaVista, EstimacionAlternativa, ModeloComparable, PreparacionAB } from "@/lib/comparativas";
import { Muestra, Seccion } from "../seccion";

/**
 * **Comparativas y calibración**: comparar sin generar (aviso, tarjeta y tabla), la confirmación y los resultados de una
 * A/B y la tarjeta de calibración. Datos de ejemplo: aquí no hay modelos ni escenas de nadie, y los botones que
 * llamarían al servidor no hacen nada.
 */

const modelo = (id: string, nombre: string, creditos: number, notas: string): ModeloComparable => ({
  id,
  nombre,
  nombreProveedor: "KIE.ai",
  capacidades: ["image_to_video"],
  estado: "validado",
  conVoz: id === "a",
  creditos,
  euros: creditos * 0.005,
  unidad: "vídeo de 4 s",
  comprobado: "2026-09-28",
  publicado: false,
  caducado: false,
  duraciones: [
    { segundos: 4, creditos },
    { segundos: 8, creditos: creditos * 2 },
  ],
  notas,
  historial: {
    terminados: id === "a" ? 6 : 0,
    fallidos: id === "a" ? 1 : 0,
    creditosMedios: id === "a" ? creditos : null,
    recientes: [],
  },
  ejemplos: [],
});

const MODELOS = [
  modelo("a", "Veo 3.1 Fast", 60, "Con voz. Bueno en planos cercanos."),
  modelo("b", "Kling 3 Turbo", 28, ""),
];

const PREPARACION: PreparacionAB = {
  escenaId: "ejemplo",
  proyectoId: "ejemplo",
  orden: 2,
  disponibles: MODELOS.map((m) => ({
    modelo: m.id,
    nombre: m.nombre,
    nombreProveedor: m.nombreProveedor,
    creditos: m.creditos,
  })),
  impedimentos: [],
  umbralAvisoCreditos: 100,
  conProducto: false,
  conPersonaje: true,
  avisos: [],
  fotograma: null,
};

const ESTIMACION: EstimacionAlternativa[] = MODELOS.map((m) => ({
  modelo: m.id,
  nombre: m.nombre,
  nombreProveedor: m.nombreProveedor,
  conVoz: m.conVoz,
  segundos: 4,
  creditos: m.creditos ?? 0,
  euros: m.euros ?? 0,
  sello: `ejemplo-${m.id}`,
  comprobado: "2026-09-28",
  precioAntiguo: false,
  impedimento: null,
}));

const RESULTADOS: ComparativaVista = {
  id: "ejemplo",
  escenaId: "ejemplo",
  proyectoId: "ejemplo",
  ejecucionesPrevistas: 2,
  ejecucionesReales: 2,
  creditosEstimados: 88,
  creditosConsumidos: 60,
  alternativas: [
    {
      modelo: "a",
      nombre: "Veo 3.1 Fast",
      creditosConfirmados: 60,
      trabajoId: "t1",
      estado: "listo",
      creditosConsumidos: 60,
      error: "",
      pudoCobrarse: true,
      medio: null,
      elegida: true,
    },
    {
      modelo: "b",
      nombre: "Kling 3 Turbo",
      creditosConfirmados: 28,
      trabajoId: "t2",
      estado: "fallido",
      creditosConsumidos: null,
      error: "El proveedor rechazó la imagen por su filtro de contenido.",
      pudoCobrarse: false,
      medio: null,
      elegida: false,
    },
  ],
  ganadorId: "t1",
  creadaEn: "2026-09-30T10:00:00.000Z",
  terminada: true,
};

const medida = (umbral: number, muestra: number, firmes: number, aciertos: number, fp: number, bi: number) => ({
  umbral,
  muestra,
  firmes,
  sinOpinion: muestra - firmes,
  aciertos,
  falsosPermisos: fp,
  bloqueosInnecesarios: bi,
  precision: aciertos / firmes,
  cobertura: firmes / muestra,
});

const CALIBRADA: CalibracionVista = {
  pregunta: "afirmacion_verificable",
  nombre: "El guion tiene una afirmación que exige verificación",
  etiquetaIndependiente: true,
  conjunto: { calibracion: { acepta: 61, rechaza: 29 }, retenido: { acepta: 27, rechaza: 12 } },
  ultima: {
    fecha: "2026-09-30T10:00:00.000Z",
    umbral: 0.8,
    suficiente: true,
    motivo: "Umbral elegido con la partición de calibración y medido en la retenida. Es una propuesta: no activa nada.",
    muestraCalibracion: 90,
    muestraRetenida: 39,
    enCalibracion: medida(0.8, 90, 70, 68, 1, 1),
    enRetenido: medida(0.8, 39, 30, 28, 1, 1),
  },
};

const SIN_MUESTRA: CalibracionVista = {
  pregunta: "resultado",
  nombre: "La escena generada corresponde a la descripción",
  etiquetaIndependiente: false,
  conjunto: { calibracion: { acepta: 5, rechaza: 2 }, retenido: { acepta: 2, rechaza: 1 } },
  ultima: {
    fecha: "2026-09-30T10:00:00.000Z",
    umbral: null,
    suficiente: false,
    motivo:
      "Muestra insuficiente: 7 ejemplos en calibración y 3 retenidos, y hacen falta 20 en cada partición. Sin datos, el umbral no se usa para automatizar.",
    muestraCalibracion: 7,
    muestraRetenida: 3,
    enCalibracion: null,
    enRetenido: null,
  },
};

export function SeccionComparativas() {
  const [seleccion, setSeleccion] = useState<string[]>(["a"]);
  const [elegidos, setElegidos] = useState<string[]>(["a", "b"]);
  return (
    <Seccion
      id="comparativas"
      titulo="Comparativas y calibración"
      descripcion="Comparar sin generar (sin coste), la A/B de una escena con su desglose de ejecuciones y coste, sus resultados lado a lado y la calibración de umbrales con muestra insuficiente."
    >
      <div className="flex flex-col gap-6">
        <Muestra titulo="Aviso permanente de comparar sin generar">
          <AvisoSinGenerar />
        </Muestra>
        <Muestra titulo="Tarjeta de modelo y tabla lado a lado">
          <div className="grid w-full gap-4 md:grid-cols-2">
            {MODELOS.map((m) => (
              <TarjetaModeloComparable key={m.id} modelo={m} seleccion={seleccion} hrefCon={() => "#comparativas"} />
            ))}
          </div>
          <div className="w-full">
            <TablaComparativa modelos={MODELOS.filter((m) => seleccion.includes(m.id))} />
          </div>
          <Boton variante="fantasma" tamano="sm" onClick={() => setSeleccion(["a", "b"])}>
            Ver los dos en la tabla
          </Boton>
        </Muestra>
        <Muestra titulo="Confirmación de una A/B (ejecuciones y coste)">
          <div className="w-full max-w-2xl">
            <ConfirmacionAB
              preparacion={PREPARACION}
              elegidos={elegidos}
              onElegidos={setElegidos}
              estimacion={elegidos.length === 2 ? ESTIMACION : null}
              cargandoEstimacion={false}
              ocupado={false}
              onEnviar={() => {}}
            />
          </div>
        </Muestra>
        <Muestra titulo="Resultados lado a lado">
          <div className="w-full">
            <ResultadosAB comparativa={RESULTADOS} ocupado={false} onElegir={() => {}} />
          </div>
        </Muestra>
        <Muestra titulo="Calibración: umbral propuesto y muestra insuficiente">
          <div className="grid w-full gap-4 lg:grid-cols-2">
            <TarjetaCalibracion calibracion={CALIBRADA} />
            <TarjetaCalibracion calibracion={SIN_MUESTRA} />
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
