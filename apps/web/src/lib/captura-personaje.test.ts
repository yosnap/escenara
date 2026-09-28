import { describe, expect, it, test } from "bun:test";
import {
  clasificarRechazos,
  esMotivoTecnico,
  esRechazoBloqueante,
  type MetricasCalidad,
  type MotivoRechazo,
  medioIdsSalvables,
  proporcionDeVista,
  type RechazoDeReferencia,
} from "./captura-personaje";

const METRICAS: MetricasCalidad = { ancho: 400, alto: 400, nitidez: 80, luminosidad: 120, caraRelativa: 0.4 };

const rechazo = (medioId: string, motivos: MotivoRechazo[], bloqueante = motivos.some(esMotivoTecnico)) =>
  ({ medioId, motivos, bloqueante, metricas: METRICAS }) satisfies RechazoDeReferencia;

describe("clasificarRechazos", () => {
  it("una foto pequeña se puede usar de todas formas", () => {
    const { salvables, bloqueantes } = clasificarRechazos([rechazo("m1", ["resolucion"])]);
    expect(salvables.map((r) => r.medioId)).toEqual(["m1"]);
    expect(bloqueantes).toEqual([]);
  });

  it("enorme y duplicada nunca se pueden saltar", () => {
    const { salvables, bloqueantes } = clasificarRechazos([rechazo("m1", ["enorme"]), rechazo("m2", ["duplicada"])]);
    expect(salvables).toEqual([]);
    expect(bloqueantes.map((r) => r.medioId)).toEqual(["m1", "m2"]);
  });

  it("un motivo técnico junto a otro salvable sigue bloqueando la foto entera", () => {
    const { salvables, bloqueantes } = clasificarRechazos([rechazo("m1", ["nitidez", "duplicada"])]);
    expect(salvables).toEqual([]);
    expect(bloqueantes).toHaveLength(1);
  });

  it("un `bloqueante` que llegue mal no abre la puerta a saltarse un mínimo técnico", () => {
    // Respuesta que dice que no bloquea pero trae un motivo técnico: manda el motivo.
    expect(esRechazoBloqueante(rechazo("m1", ["enorme"], false))).toBe(true);
    // Y al contrario: si el servidor lo marca como bloqueante, se respeta aunque el motivo sea salvable.
    expect(esRechazoBloqueante(rechazo("m2", ["nitidez"], true))).toBe(true);
  });

  it("reparte una tanda mezclada y no repite fotos al enumerar las salvables", () => {
    const rechazos = [
      rechazo("m1", ["nitidez"]),
      rechazo("m2", ["enorme"]),
      rechazo("m1", ["oscuridad"]),
      rechazo("m3", ["cara_pequena"]),
    ];
    expect(clasificarRechazos(rechazos).salvables).toHaveLength(3);
    expect(medioIdsSalvables(rechazos)).toEqual(["m1", "m3"]);
  });

  it("sin rechazos no hay nada que ofrecer", () => {
    expect(medioIdsSalvables([])).toEqual([]);
    expect(clasificarRechazos([])).toEqual({ salvables: [], bloqueantes: [] });
  });
});

describe("proporción de las vistas", () => {
  test("las de la cabeza en 3:4 y el cuerpo entero en 9:16", () => {
    expect(proporcionDeVista("frontal")).toBe("3:4");
    expect(proporcionDeVista("perfil_izquierdo")).toBe("3:4");
    expect(proporcionDeVista("tres_cuartos")).toBe("3:4");
    expect(proporcionDeVista("cuerpo_completo")).toBe("9:16");
  });
});
