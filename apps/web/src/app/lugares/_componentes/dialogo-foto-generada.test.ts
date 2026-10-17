import { describe, expect, test } from "bun:test";
import { pedidoDeFoto } from "./dialogo-foto-generada";

const DESCRIPCION = "Patio andaluz con azulejos azules y macetas.";

describe("encargo de la imagen de un lugar", () => {
  test("el diálogo enseña la descripción guardada desde la que se genera, sin espacios sobrantes", () => {
    const real = pedidoDeFoto("l1", { tipo: "candidato" }, false, `  ${DESCRIPCION} `);
    expect(real.descripcion).toContain(`desde su descripción guardada: «${DESCRIPCION}»`);
    expect(real.url).toBe("/api/lugares/l1/edicion");
    expect(real.cuerpo).toEqual({ tipo: "candidato" });
    const animado = pedidoDeFoto("l1", { tipo: "candidato" }, true, DESCRIPCION);
    expect(animado.descripcion).toContain(`«${DESCRIPCION}»`);
  });

  test("retirar personas parte de la foto, no de la descripción", () => {
    const pedido = pedidoDeFoto(
      "l1",
      { tipo: "retirar-personas", referenciaId: "r1", medioId: "m1" },
      false,
      DESCRIPCION,
    );
    expect(pedido.medioId).toBe("m1");
    expect(pedido.descripcion).not.toContain(DESCRIPCION);
  });
});
