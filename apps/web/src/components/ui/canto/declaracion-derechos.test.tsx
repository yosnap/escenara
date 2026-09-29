import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DeclaracionDerechosCanto } from "./declaracion-derechos";

const pintar = (tipo: "propia" | "licenciada" | "hablado_propio") =>
  renderToStaticMarkup(
    <DeclaracionDerechosCanto
      tipo={tipo}
      referencia=""
      aceptada={false}
      onTipo={() => {}}
      onReferencia={() => {}}
      onAceptada={() => {}}
    />,
  );

describe("declaración visible de los derechos del canto", () => {
  test("ofrece los tres derechos y muestra el texto que se acepta", () => {
    const html = pintar("propia");
    expect(html).toContain("La música es mía");
    expect(html).toContain("Tengo licencia de la música");
    expect(html).toContain("Es una grabación hablada mía");
    expect(html).toContain("Declaro que soy titular de los derechos");
    expect(html).not.toContain("uso legítimo");
  });

  test("la licencia pide referencia y la grabación hablada muestra su declaración", () => {
    expect(pintar("licenciada")).toContain("Referencia de la licencia");
    expect(pintar("hablado_propio")).toContain("grabación de mi propia voz hablando");
    expect(pintar("hablado_propio")).not.toContain("Referencia de la licencia");
  });
});
