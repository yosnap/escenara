import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { EscenaProduccionVista, ProduccionVista, TrabajoDeEscena } from "@/lib/produccion";
import type { RepartoVista } from "@/lib/reparto";
import type { EstimacionReparto } from "@/server/omni/estimacion-reparto";
import type { RepartoDePantalla } from "@/server/reparto/pantalla";
import { RepartoProduccion } from "./reparto-produccion";

const miembros: RepartoVista["miembros"] = [
  {
    id: "m1",
    personajeId: "p1",
    nombre: "Elisa",
    inventado: false,
    papel: "hablante",
    lado: "izquierda",
    mirada: "derecha",
    orden: 1,
  },
  {
    id: "m2",
    personajeId: "p2",
    nombre: "Marcos",
    inventado: false,
    papel: "hablante",
    lado: "derecha",
    mirada: "izquierda",
    orden: 2,
  },
];
const reparto = (formato: "podcast" | "dualcast"): RepartoVista => ({
  escenaId: "e1",
  formato,
  grupoPodcast: formato === "podcast" ? "grupo" : null,
  miembros,
  turnos: [
    { id: "t1", orden: 1, personajeId: "p1", nombre: "Elisa", texto: "Hola.", direccion: "" },
    { id: "t2", orden: 2, personajeId: "p2", nombre: "Marcos", texto: "Te escucho.", direccion: "" },
  ],
  mismaVoz: false,
});
const estimacion = (formato: "podcast" | "dualcast"): EstimacionReparto => ({
  escenaId: "e1",
  formato,
  clips:
    formato === "podcast"
      ? [
          { orden: 1, nombre: "Elisa", creditos: 66, turnos: 1, palabras: 1 },
          { orden: 2, nombre: "Marcos", creditos: 63, turnos: 1, palabras: 2 },
        ]
      : [{ orden: 1, nombre: "Elisa y Marcos", creditos: 66, turnos: 2, palabras: 3 }],
  creditos: formato === "podcast" ? 129 : 66,
  sello: "precio-vigente",
  comprobado: "2026-09-29",
  segundosPorClip: 4,
  precioEstimado: false,
  avisos: [],
  impedimentos: [],
});
const datos = (formato: "podcast" | "dualcast", faltan = false): RepartoDePantalla => ({
  reparto: reparto(formato),
  podcastActivo: true,
  dualcastActivo: true,
  estimacion: estimacion(formato),
  segundos: 4,
  personajes: [
    { nombre: "Elisa", inventado: false, impedimentos: [] },
    { nombre: "Marcos", inventado: false, impedimentos: faltan ? ["Su consentimiento no está registrado."] : [] },
  ],
});
const produccion = { umbralAvisoCreditos: 200 } as ProduccionVista;
const escena = (repartoDePantalla: RepartoDePantalla | null, extras: Partial<EscenaProduccionVista> = {}) =>
  ({
    id: "e1",
    estado: "aprobada",
    reparto: repartoDePantalla,
    clipsHablados: [],
    fotograma: null,
    animacion: null,
    conProducto: false,
    ...extras,
  }) as EscenaProduccionVista;
const pintar = (vista: EscenaProduccionVista) =>
  renderToStaticMarkup(
    <RepartoProduccion
      escena={vista}
      produccion={produccion}
      ocupado={false}
      avisosConfirmados={[]}
      bloqueos={[]}
      avisosGenerales={[]}
      onConfirmarAviso={() => undefined}
      onProducir={() => undefined}
      onRegenerar={() => undefined}
    />,
  );

describe("producción del reparto", () => {
  test("una escena solo no añade interfaz ni gasto", () => {
    expect(pintar(escena(null))).toBe("");
  });

  test("dualcast presenta un clip y el total de una sola confirmación", () => {
    const html = pintar(escena(datos("dualcast")));
    expect(html).toContain("Clip 1: Elisa y Marcos");
    expect(html).toContain("66 créditos (estimación)");
    expect(html).toContain("precio comprobado el 29/09/2026");
    expect(html).toContain("1. Elisa: «Hola.»");
    expect(html).toContain("Generar el clip");
  });

  test("podcast presenta dos clips y suma ambos costes", () => {
    const html = pintar(escena(datos("podcast")));
    expect(html).toContain("Clip 1: Elisa");
    expect(html).toContain("Clip 2: Marcos");
    expect(html).toContain("129 créditos (estimación)");
    expect(html).toContain("Generar los 2 clips");
  });

  test("dice quién carece de consentimiento y no permite enviar", () => {
    const html = pintar(escena(datos("podcast", true)));
    expect(html).toContain("A «Marcos» le falta: Su consentimiento no está registrado.");
    expect(html).toContain("disabled");
  });

  test("tras pedirlos muestra los dos clips en orden y con personaje", () => {
    const trabajo = (id: string): TrabajoDeEscena => ({
      id,
      tipo: "animacion",
      estado: "en_cola",
      estadoProveedor: null,
      etapa: null,
      creditosEstimados: 63,
      creditosConsumidos: null,
      error: null,
      motivoFallo: null,
      posicionEnCola: null,
      medio: null,
      modelo: "omni",
      creadoEn: "2026-09-29T01:00:00.000Z",
      enviadoEn: null,
      terminadoEn: null,
    });
    const html = pintar(
      escena(datos("podcast"), {
        clipsHablados: [
          { orden: 2, nombre: "Marcos", trabajo: trabajo("t2") },
          { orden: 1, nombre: "Elisa", trabajo: trabajo("t1") },
        ],
      }),
    );
    expect(html).toContain("Clip 1 · Elisa");
    expect(html).toContain("Clip 2 · Marcos");
  });
});
