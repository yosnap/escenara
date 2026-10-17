import { expect, test } from "bun:test";
import { pedidoDeVista } from "./dialogo-vista-generada";

test("el diálogo de la vista enseña la descripción guardada desde la que se genera", () => {
  const descripcion = "Bote de crema blanco con tapa dorada y etiqueta rosa.";
  const pedido = pedidoDeVista("p1", "envase", ` ${descripcion}  `);
  expect(pedido.descripcion).toContain(`descripción guardada del producto: «${descripcion}»`);
  expect(pedido.url).toBe("/api/productos/p1/generacion");
  expect(pedido.cuerpo).toEqual({ papel: "envase" });
  expect(pedido.medioId).toBeNull();
});
