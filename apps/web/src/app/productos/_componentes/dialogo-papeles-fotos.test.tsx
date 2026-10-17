import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Medio } from "@/lib/media/tipos";
import { AYUDA_PAPEL_REFERENCIA, NOMBRE_PAPEL_REFERENCIA, PAPELES_POR_TIPO, papelPorDefecto } from "@/lib/productos";
import { CuerpoPapelesFotos } from "./dialogo-papeles-fotos";

const medio = { id: "m1", titulo: "Botella", nombre: "botella.png" } as unknown as Medio;
const opciones = PAPELES_POR_TIPO.fisico.map((p) => ({
  value: p,
  label: NOMBRE_PAPEL_REFERENCIA[p],
  descripcion: AYUDA_PAPEL_REFERENCIA[p],
}));
const pintar = (error = "") =>
  renderToStaticMarkup(
    <CuerpoPapelesFotos
      medios={[medio]}
      opciones={opciones}
      papelDe={() => papelPorDefecto("fisico")}
      ocupado={false}
      error={error}
      onCambio={() => {}}
    />,
  );

describe("diálogo de papeles al añadir fotos", () => {
  test("cada foto parte del papel neutro del tipo, no de la etiqueta", () => {
    const html = pintar();
    expect(html).toContain("El envase entero");
  });

  test("si el alta falla, sigue abierto con la causa", () => {
    const html = pintar("Un producto admite 8 fotos como mucho.");
    expect(html).toContain("Un producto admite 8 fotos como mucho.");
    expect(html).toContain('data-alerta="error"');
  });
});
