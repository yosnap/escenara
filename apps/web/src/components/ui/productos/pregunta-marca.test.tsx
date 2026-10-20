import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { INVITACION_MARCA_SIN_RESPONDER, PREGUNTA_MARCA_VISIBLE } from "@/lib/productos";
import { PreguntaMarca } from "./pregunta-marca";

/** «¿Se ve una marca?» es un Sí/No obligatorio con el grupo de opciones del catálogo, nunca un `<select>`. */
describe("pregunta de la marca", () => {
  test("ofrece Sí y No con su explicación, sin desplegable nativo", () => {
    const html = renderToStaticMarkup(<PreguntaMarca valor={null} onCambio={() => {}} />);
    expect(html).toContain(PREGUNTA_MARCA_VISIBLE);
    expect(html).toContain("Sí, se ve una marca");
    expect(html).toContain("No, no se ve ninguna");
    expect(html).toContain("Es obligatorio responder");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("Solo para avisarte");
  });

  test("en la ficha, sin responder, invita a responder y dice qué pasa mientras tanto", () => {
    expect(renderToStaticMarkup(<PreguntaMarca valor={null} onCambio={() => {}} invitarSiFalta />)).toContain(
      INVITACION_MARCA_SIN_RESPONDER,
    );
    expect(renderToStaticMarkup(<PreguntaMarca valor={false} onCambio={() => {}} invitarSiFalta />)).not.toContain(
      INVITACION_MARCA_SIN_RESPONDER,
    );
  });
});
