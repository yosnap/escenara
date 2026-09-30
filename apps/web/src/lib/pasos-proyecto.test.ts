import { describe, expect, test } from "bun:test";
import type { BriefVista } from "./anuncio";
import { type DatosPasosProyecto, pasoPredeterminadoDelProyecto, pasosDelProyecto } from "./pasos-proyecto";

const NUEVO: DatosPasosProyecto = { briefActivo: true, brief: null, idea: "", totalEscenas: 0, estado: "borrador" };

const brief = (cambios: Partial<BriefVista> = {}): BriefVista =>
  ({
    productoId: "p1",
    angulo: "dolor",
    anguloVista: { exigeDeclaracion: false },
    declaracionRegistrada: false,
    ...cambios,
  }) as BriefVista;

const estados = (d: Partial<DatosPasosProyecto>) =>
  Object.fromEntries(pasosDelProyecto({ ...NUEVO, ...d }).map((p) => [p.id, p.estado]));

describe("pasos de un proyecto", () => {
  test("brief → idea → escenas → aprobación; sin escenas, la aprobación está bloqueada con su motivo", () => {
    const pasos = pasosDelProyecto(NUEVO);
    expect(pasos.map((p) => p.id)).toEqual(["brief", "idea", "escenas", "aprobacion"]);
    expect(pasos.map((p) => p.estado)).toEqual(["pendiente", "pendiente", "pendiente", "bloqueado"]);
    expect(pasos[3]?.motivo).toContain("escena");
  });

  test("el brief: en curso a medias, hecho completo y hecho si está apagado", () => {
    expect(estados({ brief: brief({ angulo: "" }) }).brief).toBe("en-curso");
    expect(estados({ brief: brief({ productoId: null }) }).brief).toBe("en-curso");
    expect(estados({ brief: brief() }).brief).toBe("hecho");
    expect(estados({ briefActivo: false }).brief).toBe("hecho");
  });

  test("un ángulo que exige declaración no deja el brief hecho hasta registrarla", () => {
    const exige = { anguloVista: { exigeDeclaracion: true } } as Partial<BriefVista>;
    expect(estados({ brief: brief(exige) }).brief).toBe("en-curso");
    expect(estados({ brief: brief({ ...exige, declaracionRegistrada: true }) }).brief).toBe("hecho");
  });

  test("idea escrita, escenas y plan aprobado", () => {
    expect(estados({ idea: "  un anuncio  ", totalEscenas: 2 })).toMatchObject({
      idea: "hecho",
      escenas: "hecho",
      aprobacion: "pendiente",
    });
    expect(estados({ totalEscenas: 2, estado: "planificado" }).aprobacion).toBe("hecho");
  });
});

describe("escenas con cambios sin guardar", () => {
  test("no se marcan como hechas: siguen en curso hasta guardar o descartar", () => {
    expect(estados({ totalEscenas: 2, escenasSinGuardar: true }).escenas).toBe("en-curso");
    expect(estados({ totalEscenas: 2, escenasSinGuardar: false }).escenas).toBe("hecho");
  });
});

describe("paso con el que se abre un proyecto", () => {
  test("donde está el trabajo", () => {
    expect(pasoPredeterminadoDelProyecto(NUEVO)).toBe("brief");
    expect(pasoPredeterminadoDelProyecto({ ...NUEVO, briefActivo: false })).toBe("idea");
    expect(pasoPredeterminadoDelProyecto({ ...NUEVO, idea: "algo" })).toBe("idea");
    expect(pasoPredeterminadoDelProyecto({ ...NUEVO, totalEscenas: 1 })).toBe("escenas");
    expect(pasoPredeterminadoDelProyecto({ ...NUEVO, totalEscenas: 1, estado: "en_produccion" })).toBe("aprobacion");
  });
});
