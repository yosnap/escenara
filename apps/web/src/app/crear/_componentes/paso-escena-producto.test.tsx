import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { OpcionDireccion } from "@/lib/direccion";
import type { CatalogoParaCrear } from "@/lib/presets";
import { PRODUCTO_ELEGIDO_VACIO, type ProductoElegido } from "@/lib/productos";
import { ESTADO_PLANTILLA_VACIO, previsualizar } from "./panel-plantilla";
import { PasoEscena } from "./paso-escena";

/**
 * En «Crear» el producto también se elige al describir la escena: entra en el fotograma como referencia y en el clip
 * sigue elegido. El selector es el mismo del clip (sin `<select>` nativo).
 */
const CATALOGO = { presets: [], incompatibles: {}, plantillas: [] } as unknown as CatalogoParaCrear;
const ACCIONES = [
  { clave: "sostenerlo", nombre: "Sostenerlo", descripcion: "Lo tiene en la mano." },
] as unknown as OpcionDireccion[];

const pintar = (producto: ProductoElegido, acciones: OpcionDireccion[] | null = ACCIONES, bloqueado = false) =>
  renderToStaticMarkup(
    <PasoEscena
      numero={4}
      prompt=""
      dialogo=""
      conVoz={false}
      catalogo={CATALOGO}
      plantilla={ESTADO_PLANTILLA_VACIO}
      previa={previsualizar(CATALOGO, ESTADO_PLANTILLA_VACIO, "", null)}
      requisitos={[]}
      deshabilitado={false}
      accionesDePreset={() => null}
      producto={producto}
      accionesProducto={acciones ?? undefined}
      productoBloqueado={bloqueado}
      onProducto={() => {}}
      onPrompt={() => {}}
      onDialogo={() => {}}
      onPlantilla={() => {}}
      onDuplicar={() => {}}
    />,
  );

describe("producto en el paso de la escena", () => {
  test("se ofrece elegir el producto del fotograma, con su explicación", () => {
    const html = pintar(PRODUCTO_ELEGIDO_VACIO);
    expect(html).toContain("El producto");
    expect(html).toContain("sale ya en el fotograma");
    expect(html).not.toContain("<select");
  });

  test("con un producto elegido se pide qué hace el personaje con él", () => {
    const html = pintar({ productoId: "p1", accion: "" });
    expect(html).toContain("Sostenerlo");
  });

  test("sin catálogo de acciones todavía no se pinta el selector", () => {
    expect(pintar(PRODUCTO_ELEGIDO_VACIO, null)).not.toContain("sale ya en el fotograma");
  });

  test("con el fotograma ya pedido, el producto se ve pero no se cambia, y se dice por qué", () => {
    const html = pintar({ productoId: "p1", accion: "sostenerlo" }, ACCIONES, true);
    expect(html).toContain("El fotograma ya está pedido con este producto");
    expect(pintar({ productoId: "p1", accion: "sostenerlo" })).not.toContain("El fotograma ya está pedido");
  });
});
