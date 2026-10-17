import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfirmacionAB } from "@/components/ui/comparativas/confirmacion-ab";
import type { PreparacionAB } from "@/lib/comparativas";
import { ConfirmacionGasto } from "./confirmacion-gasto";

/**
 * En la producción de un proyecto y en la comparativa A/B la casilla de la marca sigue la misma regla que «Crear»:
 * solo con un producto con marca (o sin responder). Con uno declarado sin marca ni sale ni falta.
 */
const MARCA = "Tengo derecho a usar esta marca";

const gasto = (conMarca: boolean) =>
  renderToStaticMarkup(
    <ConfirmacionGasto
      titulo="Producir la escena 1"
      explicacion="Se genera el fotograma."
      creditos={4}
      umbral={200}
      sello="s"
      etiqueta="Producir"
      firma="f"
      bloqueos={[]}
      avisosConfirmados={[]}
      conMarca={conMarca}
      ocupado={false}
      onEnviar={() => {}}
    />,
  );

const PREPARACION: PreparacionAB = {
  escenaId: "e1",
  proyectoId: "p1",
  orden: 1,
  disponibles: [{ modelo: "a", nombre: "Veo 3.1 Fast", nombreProveedor: "KIE.ai", creditos: 60 }],
  impedimentos: [],
  umbralAvisoCreditos: 500,
  conProducto: true,
  conMarca: true,
  conPersonaje: false,
  avisos: [],
  fotograma: null,
};

const ab = (conMarca: boolean) =>
  renderToStaticMarkup(
    <ConfirmacionAB
      preparacion={{ ...PREPARACION, conMarca }}
      elegidos={["a"]}
      onElegidos={() => {}}
      estimacion={null}
      cargandoEstimacion={false}
      ocupado={false}
      onEnviar={() => {}}
    />,
  );

describe("casilla de la marca en proyectos y comparativas", () => {
  test("producción: solo con un producto con marca", () => {
    expect(gasto(true)).toContain(MARCA);
    expect(gasto(false)).not.toContain(MARCA);
    expect(gasto(false)).not.toContain("derecho a usar la marca del producto");
  });

  test("comparativa A/B: con producto sin marca no sale aunque haya producto", () => {
    expect(ab(true)).toContain(MARCA);
    expect(ab(false)).not.toContain(MARCA);
  });
});
