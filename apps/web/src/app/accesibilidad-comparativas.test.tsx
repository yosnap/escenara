import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { auditar } from "@/lib/axe-de-prueba";
import type { CalibracionVista } from "@/lib/calibracion";
import type { ComparativaVista, ModeloComparable, PreparacionAB } from "@/lib/comparativas";
import type { Sesion } from "@/server/auth/sesion";

/**
 * **axe sobre las pantallas de comparativas y calibración** con datos de ejemplo, pintadas como las sirve el servidor
 * (cabecera, `main#contenido` y su `h1`): `/comparar`, `/comparar/escena/[id]` antes y después de lanzar, y
 * `/admin/calibracion`. Ninguna puede tener violaciones serias o críticas.
 *
 * Límite: el diálogo de elegir ganadora se monta en un portal y solo en el navegador (no sale en `renderToStaticMarkup`),
 * así que aquí no se audita. Es el `Dialogo` del catálogo (título, descripción, foco atrapado y cierre con Escape) con un
 * párrafo y dos botones del catálogo, sin nada propio.
 */

const navegacion = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...navegacion,
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
  usePathname: () => "/comparar",
  useSearchParams: () => new URLSearchParams(),
}));

const { CabeceraApp } = await import("./_app/cabecera-app");
const { CabeceraAdmin } = await import("./admin/cabecera-admin");
const { AvisoSinGenerar, TablaComparativa, TarjetaModeloComparable } = await import(
  "@/components/ui/comparativas/comparar-modelos"
);
const { ComparativaAB } = await import("./comparar/escena/[id]/comparativa-ab");
const { ConfirmacionAB } = await import("@/components/ui/comparativas/confirmacion-ab");
const { TarjetaCalibracion } = await import("@/components/ui/calibracion");
const { Recalibrar } = await import("./admin/calibracion/recalibrar");

const SESION = {
  user: { id: "u1", name: "Ana", email: "ana@ejemplo.test", role: "user", emailVerified: true },
  session: { id: "s1" },
} as unknown as Sesion;

const pagina = (cabecera: ReactNode, titulo: string, contenido: ReactNode) =>
  renderToStaticMarkup(
    <div className="min-h-dvh bg-fondo">
      {cabecera}
      <main id="contenido" tabIndex={-1}>
        <h1>{titulo}</h1>
        {contenido}
      </main>
    </div>,
  );

const sinGraves = async (html: string) => expect((await auditar(html)).graves).toEqual([]);

const modelo = (id: string, nombre: string): ModeloComparable => ({
  id,
  nombre,
  nombreProveedor: "KIE.ai",
  capacidades: ["image_to_video"],
  estado: "validado",
  conVoz: true,
  creditos: 60,
  euros: 0.3,
  unidad: "vídeo de 4 s",
  comprobado: "2026-09-28",
  publicado: false,
  caducado: false,
  duraciones: [{ segundos: 4, creditos: 60 }],
  proporciones: ["9:16"],
  resoluciones: ["720p"],
  maximoReferencias: 1,
  historial: { terminados: 3, fallidos: 1, creditosMedios: 58, recientes: [] },
  ejemplos: [],
});

const PREPARACION: PreparacionAB = {
  escenaId: "e1",
  proyectoId: "p1",
  orden: 2,
  disponibles: [
    { modelo: "a", nombre: "Veo 3.1 Fast", nombreProveedor: "KIE.ai", creditos: 60 },
    { modelo: "b", nombre: "Kling 3 Turbo", nombreProveedor: "KIE.ai", creditos: 28 },
  ],
  impedimentos: [],
  umbralAvisoCreditos: 50,
  conProducto: true,
  conPersonaje: true,
  avisos: [{ regla: "precio-antiguo", motivo: "El precio de este modelo se comprobó hace más de 90 días." }],
  fotograma: null,
};

const COMPARATIVA: ComparativaVista = {
  id: "c1",
  escenaId: "e1",
  proyectoId: "p1",
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
      estado: "en_curso",
      creditosConsumidos: null,
      error: "",
      pudoCobrarse: false,
      medio: null,
      elegida: false,
    },
    {
      modelo: "b",
      nombre: "Kling 3 Turbo",
      creditosConfirmados: 28,
      trabajoId: "t2",
      estado: "fallido",
      creditosConsumidos: null,
      error: "El proveedor rechazó la imagen por su filtro de contenido.",
      pudoCobrarse: true,
      medio: null,
      elegida: false,
    },
  ],
  ganadorId: null,
  creadaEn: "2026-09-30T10:00:00.000Z",
  terminada: false,
};

const medida = {
  umbral: 0.8,
  muestra: 39,
  firmes: 30,
  sinOpinion: 9,
  aciertos: 28,
  falsosPermisos: 1,
  bloqueosInnecesarios: 1,
  precision: 0.93,
  cobertura: 0.77,
};

const CALIBRACIONES: CalibracionVista[] = [
  {
    pregunta: "afirmacion_verificable",
    nombre: "El guion tiene una afirmación que exige verificación",
    etiquetaIndependiente: true,
    conjunto: { calibracion: { acepta: 61, rechaza: 29 }, retenido: { acepta: 27, rechaza: 12 } },
    ultima: {
      fecha: "2026-09-30T10:00:00.000Z",
      umbral: 0.8,
      suficiente: true,
      motivo: "Umbral elegido con la partición de calibración y medido en la retenida.",
      muestraCalibracion: 90,
      muestraRetenida: 39,
      enCalibracion: { ...medida, muestra: 90, firmes: 70 },
      enRetenido: medida,
    },
  },
  {
    pregunta: "resultado",
    nombre: "La escena generada corresponde a la descripción",
    etiquetaIndependiente: false,
    conjunto: { calibracion: { acepta: 3, rechaza: 1 }, retenido: { acepta: 1, rechaza: 0 } },
    ultima: {
      fecha: "2026-09-30T10:00:00.000Z",
      umbral: null,
      suficiente: false,
      motivo: "Muestra insuficiente. Sin datos, el umbral no se usa para automatizar.",
      muestraCalibracion: 4,
      muestraRetenida: 1,
      enCalibracion: null,
      enRetenido: null,
    },
  },
];

describe("axe: comparativas y calibración", () => {
  test("/comparar, con dos modelos lado a lado", async () => {
    const modelos = [modelo("a", "Veo 3.1 Fast"), modelo("b", "Kling 3 Turbo")];
    await sinGraves(
      pagina(
        <CabeceraApp sesion={SESION} />,
        "Comparar modelos",
        <>
          <AvisoSinGenerar />
          <TablaComparativa modelos={modelos} />
          {modelos.map((m) => (
            <TarjetaModeloComparable key={m.id} modelo={m} seleccion={["a"]} hrefCon={() => "/comparar"} />
          ))}
        </>,
      ),
    );
  });

  test("/comparar/escena/[id] antes de lanzar, con el desglose y todas las casillas", async () => {
    await sinGraves(
      pagina(
        <CabeceraApp sesion={SESION} />,
        "Comparar generando · escena 2",
        <ConfirmacionAB
          preparacion={PREPARACION}
          elegidos={["a", "b"]}
          onElegidos={() => {}}
          estimacion={PREPARACION.disponibles.map((d) => ({
            modelo: d.modelo,
            nombre: d.nombre,
            nombreProveedor: d.nombreProveedor,
            conVoz: true,
            segundos: 4,
            creditos: d.creditos ?? 0,
            euros: 0.1,
            sello: `s-${d.modelo}`,
            comprobado: "2026-09-28",
            precioAntiguo: false,
            impedimento: null,
          }))}
          cargandoEstimacion={false}
          ocupado={false}
          onEnviar={() => {}}
        />,
      ),
    );
  });

  test("/comparar/escena/[id] con resultados lado a lado", async () => {
    await sinGraves(
      pagina(
        <CabeceraApp sesion={SESION} />,
        "Comparar generando · escena 2",
        <ComparativaAB preparacion={PREPARACION} inicial={COMPARATIVA} />,
      ),
    );
    await sinGraves(
      pagina(
        <CabeceraApp sesion={SESION} />,
        "Comparar generando · escena 2",
        <ComparativaAB
          preparacion={{ ...PREPARACION, impedimentos: ["Esta escena ya tiene un clip en marcha."] }}
          inicial={null}
        />,
      ),
    );
  });

  test("/admin/calibracion, con umbral propuesto y con muestra insuficiente", async () => {
    await sinGraves(
      pagina(
        <CabeceraAdmin version="0.48.0" />,
        "Calibración",
        <>
          <Recalibrar />
          {CALIBRACIONES.map((c) => (
            <TarjetaCalibracion key={c.pregunta} calibracion={c} />
          ))}
        </>,
      ),
    );
  });
});
