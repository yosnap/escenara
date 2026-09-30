import { describe, expect, test } from "bun:test";
import type { ModeloVista } from "@/lib/catalogo";
import { admiteFotoDeProducto } from "./modelos-sugeridos";

const modelo = (id: string, maximoReferencias: number): ModeloVista => ({
  id: `ejemplo-${id}`,
  proveedor: "kie",
  nombreProveedor: "KIE.ai",
  modelo: id,
  nombre: id,
  capacidades: ["image_to_video"],
  estado: "validado",
  conVoz: true,
  unidad: "vídeo de 4 s",
  parametros: {
    duraciones: [4],
    proporciones: [],
    resoluciones: [],
    formatosReferencia: ["image/png"],
    maximoReferencias,
  },
  notas: "",
  evidencia: "",
  version: 1,
  predeterminado: false,
  precio: null,
  tarifas: [],
  actualizado: "2026-09-30T00:00:00.000Z",
});

describe("qué modelos admiten la foto del producto", () => {
  test("Veo no: su segunda imagen es el último fotograma del clip, no una galería", () => {
    expect(admiteFotoDeProducto(modelo("veo3_lite", 2))).toBe(false);
    expect(admiteFotoDeProducto(modelo("veo3_fast", 2))).toBe(false);
  });

  test("un modelo de una sola imagen tampoco", () => {
    expect(admiteFotoDeProducto(modelo("hailuo/2-3-image-to-video-standard", 1))).toBe(false);
  });

  test("con al menos dos huecos de galería, cabe el fotograma y la foto del producto", () => {
    expect(admiteFotoDeProducto(modelo("otro-modelo-de-clip", 2))).toBe(true);
    expect(admiteFotoDeProducto(modelo("otro-modelo-de-clip", 4))).toBe(true);
  });

  test("un proveedor sin adaptador en esta instalación no se ofrece como alternativa", () => {
    expect(admiteFotoDeProducto({ ...modelo("x", 4), proveedor: "no-existe" })).toBe(false);
  });
});
