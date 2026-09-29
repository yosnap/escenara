import { expect, test } from "bun:test";
import { vistaDeControlesProductoClip } from "./controles-producto-clip";

test("antes de animar se ofrece confirmar que el modelo no admite la foto del producto", () => {
  const vista = vistaDeControlesProductoClip(
    {
      nombre: "Hailuo 2.3 Standard",
      maximoReferencias: 1,
      precioComprobado: "2026-09-29",
      precioCaducado: false,
      costeAcotado: true,
      motivoSinAcotar: "",
    },
    {
      nombre: "Crema de noche Aurora",
      sinFotos: false,
      referenciasNoCaben: false,
      sinHuecoDeReferencia: true,
      modelosConFoto: ["MiniMax H3"],
      pocoFiable: false,
      nombreAccion: "Enseñarlo a cámara",
      identidadRegistradaPerdida: false,
      marcaVisible: false,
    },
    { exigirCoberturaVistas: false, exigirPrecioFresco: false, maximoAvisos: 5 },
  );

  expect(vista.estado).toBe("ajustes");
  expect(vista.comprobaciones).toEqual([
    expect.objectContaining({
      regla: "producto-sin-hueco-de-referencia",
      confirmable: true,
      motivo: expect.stringContaining("no admite la foto"),
    }),
  ]);
});
