import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FotosRechazadas } from "./fotos-rechazadas";

const METRICAS = { ancho: 1024, alto: 1024, nitidez: 200, luminosidad: 120, caraRelativa: null };

test("una persona en las fotos de un animal se explica con su causa y sin «usarla de todas formas»", () => {
  const html = renderToStaticMarkup(
    <FotosRechazadas
      rechazos={[{ medioId: "m1", motivos: ["persona_en_animal"], bloqueante: true, metricas: METRICAS }]}
      medios={[]}
      ocupado={false}
      onUsarDeTodasFormas={() => {}}
    />,
  );
  expect(html).toContain("Aparece una persona");
  expect(html).toContain(
    "En esta foto aparece una persona; un animal no puede tener fotos de personas. Si es una persona, créala como persona con su consentimiento.",
  );
  expect(html).not.toContain("Usarla de todas formas");
  expect(html).not.toContain("ya las tienes");
});
