import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Medio } from "@/lib/media/tipos";
import { PanelReferenciasTemporales } from "./panel-referencias-temporales";
import { problemaDeReferencias, referenciasParaEnviar } from "./referencias-en-pantalla";

const referencia = {
  id: "r1",
  etiqueta: "terraza",
  uso: "lugar" as const,
  medio: { id: crypto.randomUUID(), url: "/terraza.png", tipo: "imagen", nombre: "Terraza" } as Medio,
};
const referencias = [referencia];
test("la revisión enseña la imagen, su etiqueta y qué debe conservar", () => {
  const html = renderToStaticMarkup(<PanelReferenciasTemporales referencias={referencias} revision />);
  expect(html).toContain("Referencias que se enviarán");
  expect(html).toContain("@terraza");
  expect(html).toContain("Lugar");
  expect(html).toContain("terraza.png");
  expect(html).not.toContain("Añadir referencia");
});
test("no se puede confirmar una referencia vacía o una etiqueta sin imagen", () => {
  expect(problemaDeReferencias([{ ...referencia, medio: null }], "En @terraza", 10, 3, true)).toContain(
    "Elige una imagen",
  );
  expect(problemaDeReferencias(referencias, "En @chaqueta", 10, 3, true)).toContain("no tiene una imagen");
});
test("el envío conserva la asociación y bloquea modelos que no pueden recibirla", () => {
  expect(referenciasParaEnviar(referencias)).toEqual([
    { medioId: referencia.medio.id, etiqueta: "terraza", uso: "lugar" },
  ]);
  expect(problemaDeReferencias(referencias, "En @terraza", 1, 1, true)).toContain("necesita 2");
  expect(problemaDeReferencias(referencias, "En @terraza", 10, 3, true)).toBeNull();
});
