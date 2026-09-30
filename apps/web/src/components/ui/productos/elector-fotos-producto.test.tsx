import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Medio } from "@/lib/media/tipos";
import type { PapelReferencia, ReferenciaProducto } from "@/lib/productos";
import { ElectorFotosProducto } from "./elector-fotos-producto";

const medio = (id: string): Medio => ({
  id,
  tipo: "imagen",
  nombre: `${id}.png`,
  mime: "image/png",
  tamano: 1,
  ancho: 96,
  alto: 96,
  duracion: null,
  titulo: "",
  altEs: "",
  altEn: "",
  url: `https://ejemplo.test/${id}.png`,
  creadoEn: "2026-09-30T00:00:00.000Z",
  actualizadoEn: "2026-09-30T00:00:00.000Z",
  enPapelera: false,
  origen: null,
  documento: false,
  permisos: { editarImagen: true, borrarDefinitivo: true },
});

const foto = (id: string, papel: PapelReferencia, orden: number): ReferenciaProducto => ({
  id: `ref-${id}`,
  papel,
  orden,
  medio: medio(id),
});

const FOTOS = [
  foto("frontal", "etiqueta", 1),
  foto("envase", "envase", 2),
  foto("tapa", "mecanismo", 3),
  foto("suelta", "suelto", 4),
];

const pintar = (marcadas: string[], caben = 2) =>
  renderToStaticMarkup(
    <ElectorFotosProducto nombre="Caja Huerta" fotos={FOTOS} caben={caben} marcadas={marcadas} onAlternar={() => {}} />,
  );

describe("elegir qué fotos del producto viajan", () => {
  test("dice cuántas tiene, cuántas caben y cuántas se envían", () => {
    const html = pintar(["frontal", "envase"]);
    expect(html).toContain("tiene 4 fotos y en este clip solo caben 2");
    expect(html).toContain("Se envían 2 de 2 posibles.");
  });

  test("hay una casilla por foto, con el papel de cada una, y las marcadas lo están", () => {
    const html = pintar(["frontal", "envase"]);
    expect(html.match(/role="checkbox"/g)?.length).toBe(4);
    expect(html).toContain("Frontal con la etiqueta");
    expect(html).toContain("Detalle de la tapa o el mecanismo");
    expect(html.match(/aria-checked="true"/g)?.length).toBe(2);
  });

  test("con el cupo lleno solo se pueden quitar: las no marcadas están deshabilitadas", () => {
    const html = pintar(["frontal", "envase"]);
    expect(html.match(/aria-disabled="true"|disabled=""/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  test("sin la frontal marcada avisa de que la etiqueta puede salir distinta", () => {
    expect(pintar(["envase", "tapa"])).toContain("Sin la frontal con la etiqueta");
    expect(pintar(["frontal", "envase"])).not.toContain("Sin la frontal con la etiqueta");
  });
});
