import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { formatearTamano } from "@/lib/media/reglas";
import type { Medio } from "@/lib/media/tipos";
import { avisoDeCuota, type VersionDeClip } from "@/lib/produccion";
import { BibliotecaVersiones } from "./biblioteca-versiones";

const MB = 1024 * 1024;

const version = (trabajoId: string, elegida: boolean, cambios: Partial<VersionDeClip> = {}): VersionDeClip => ({
  trabajoId,
  modelo: "veo3_lite",
  creditosConsumidos: 60,
  creditosEstimados: 60,
  medio: { id: `m-${trabajoId}`, url: `https://s3.local/${trabajoId}.mp4`, tamano: 3 * MB } as Medio,
  creadoEn: "2026-09-30T10:00:00.000Z",
  proporcion: "9:16",
  elegida,
  ...cambios,
});

const sinAgobio = { usadoBytes: 10 * MB, cuotaBytes: 1000 * MB, versionesSinUsarBytes: 3 * MB };

const pintar = (versiones: VersionDeClip[], cuota = sinAgobio) =>
  renderToStaticMarkup(<BibliotecaVersiones versiones={versiones} cuota={cuota} onUsar={() => {}} />);

describe("la biblioteca de versiones del clip", () => {
  test("con una sola versión no hay nada que elegir y no se pinta", () => {
    expect(pintar([version("t1", true)])).toBe("");
  });

  test("marca la que está en uso, ofrece «Usar esta» en las demás y dice que no cuesta ni borra nada", () => {
    const html = pintar([version("t2", false), version("t1", true)]);
    expect(html).toContain("Versiones del clip (2)");
    expect(html).toContain("En uso en el montaje");
    expect(html.match(/Usar esta/g)).toHaveLength(1);
    expect(html).toContain("No cuesta nada y no se borra ninguna");
    expect(html).toContain("según el proveedor");
  });

  test("sin gasto informado por el proveedor, se enseña la estimación y se dice que lo es", () => {
    const html = pintar([version("t2", false, { creditosConsumidos: null }), version("t1", true)]);
    expect(html).toContain("estimación: el proveedor no informó del gasto");
  });

  test("con la biblioteca casi llena avisa de la cuota y de lo que ocupan las versiones sin usar", () => {
    const html = pintar([version("t2", false), version("t1", true)], {
      usadoBytes: 900 * MB,
      cuotaBytes: 1000 * MB,
      versionesSinUsarBytes: 3 * MB,
    });
    expect(html).toContain("Tu biblioteca está al 90 %");
    expect(html).toContain("Las versiones que no usas de este proyecto ocupan");
  });
});

describe("el aviso de cuota", () => {
  test("sin límite o por debajo del 80 % no dice nada", () => {
    expect(avisoDeCuota({ ...sinAgobio, cuotaBytes: null }, formatearTamano)).toBeNull();
    expect(avisoDeCuota({ ...sinAgobio, usadoBytes: 790 * MB }, formatearTamano)).toBeNull();
    expect(avisoDeCuota({ ...sinAgobio, usadoBytes: 800 * MB }, formatearTamano)).toContain("al 80 %");
  });
});
