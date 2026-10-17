import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  bloqueosDeConsentimiento,
  CONSENTIMIENTO_INICIAL,
  FormularioConsentimiento,
} from "./formulario-consentimiento";

/**
 * La declaración de mayoría de edad es sobre **la persona** de las fotos: a un animal no se le pide, y a una
 * persona se le sigue exigiendo. El servidor aplica la misma regla al registrar.
 */
describe("consentimiento y mayoría de edad", () => {
  test("a una persona se le exige declarar que es mayor de edad", () => {
    expect(bloqueosDeConsentimiento(CONSENTIMIENTO_INICIAL, "persona")).toContain(
      "Falta declarar que la persona de las fotos es mayor de edad.",
    );
    const html = renderToStaticMarkup(
      <FormularioConsentimiento tipo="persona" valor={CONSENTIMIENTO_INICIAL} onCambio={() => {}} />,
    );
    expect(html).toContain("Declaro que es mayor de edad");
  });

  test("a un animal no se le pide ni se le exige la mayoría de edad", () => {
    const animal = { ...CONSENTIMIENTO_INICIAL, titular: "animal_propio" as const };
    expect(bloqueosDeConsentimiento(animal, "animal")).toEqual([]);
    const html = renderToStaticMarkup(<FormularioConsentimiento tipo="animal" valor={animal} onCambio={() => {}} />);
    expect(html).not.toContain("Declaro que es mayor de edad");
  });

  test("un animal de otra persona sigue necesitando su documento firmado", () => {
    const ajeno = { ...CONSENTIMIENTO_INICIAL, titular: "tercero" as const };
    expect(bloqueosDeConsentimiento(ajeno, "animal")).toEqual([
      "Falta subir el documento de consentimiento firmado por esa persona.",
    ]);
  });
});
