import { describe, expect, test } from "bun:test";
import { ESQUINAS_KIT, esKitDeExportacion, esquinaEfectiva, franjaDe } from "./marca-kit";
import { POSICIONES_ETIQUETA } from "./montaje";

describe("esquina del logotipo del kit", () => {
  test("nunca comparte franja con la etiqueta, y conserva el lado elegido", () => {
    for (const esquina of ESQUINAS_KIT) {
      for (const etiqueta of POSICIONES_ETIQUETA) {
        const efectiva = esquinaEfectiva(esquina, etiqueta);
        expect(franjaDe(efectiva)).not.toBe(etiqueta);
        expect(efectiva.split("-")[1]).toBe(esquina.split("-")[1] as string);
      }
    }
  });

  test("si no coincide, se queda donde se eligió", () => {
    expect(esquinaEfectiva("arriba-derecha", "abajo")).toBe("arriba-derecha");
    expect(esquinaEfectiva("abajo-izquierda", "abajo")).toBe("arriba-izquierda");
  });

  test("solo se acepta un kit de exportación bien formado", () => {
    expect(esKitDeExportacion({ activoId: crypto.randomUUID(), esquina: "abajo-derecha" })).toBe(true);
    expect(esKitDeExportacion({ activoId: "../../etc", esquina: "abajo-derecha" })).toBe(false);
    expect(esKitDeExportacion({ activoId: crypto.randomUUID(), esquina: "centro" })).toBe(false);
    expect(esKitDeExportacion(null)).toBe(false);
  });
});
