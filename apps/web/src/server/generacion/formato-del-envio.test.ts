import { describe, expect, test } from "bun:test";
import type { ModeloVista } from "@/lib/catalogo";
import { proporcionDelTrabajo, proporcionPedidaDe } from "../cola/entrada-del-trabajo";
import type { FilaTrabajo } from "../db/esquema";
import type { OpcionDeGeneracion } from "../mapa/generacion";
import { ErrorGeneracion } from "./errores";
import { motivoFormatoDelFotograma, proporcionDelEnvio, reservasGuardadas } from "./formato-del-envio";

/**
 * El formato de un envío (0.41.0), sin base de datos: qué proporción se pide, qué reservas se guardan y qué hace el
 * despacho con una proporción que el modelo no admite. La prueba de integración lo comprueba contra la cola.
 */

const modelo = (nombre: string, proporciones: string[]) =>
  ({ nombre, modelo: nombre.toLowerCase(), proveedor: "kie", parametros: { proporciones } }) as unknown as ModeloVista;

const veo = modelo("Veo", ["9:16", "16:9"]);
const hailuo = modelo("Hailuo", []);

const compuesto = (proporcion: string | null) => ({ proporcion }) as Parameters<typeof proporcionDelEnvio>[1];

describe("la proporción de un envío", () => {
  test("la fijada por el proyecto manda sobre la del preset; sin ninguna, manda la del modelo", () => {
    expect(proporcionDelEnvio("16:9", compuesto("9:16"), veo)).toBe("16:9");
    expect(proporcionDelEnvio(undefined, compuesto("9:16"), veo)).toBe("9:16");
    expect(proporcionDelEnvio(undefined, null, veo)).toBeNull();
  });

  test("una proporción que el modelo no admite se rechaza antes de encolar, diciendo que no se ha cobrado", () => {
    expect(() => proporcionDelEnvio("1:1", null, veo)).toThrow(ErrorGeneracion);
    expect(() => proporcionDelEnvio("1:1", null, veo)).toThrow("Veo solo admite 9:16, 16:9");
    expect(() => proporcionDelEnvio("9:16", null, hailuo)).toThrow("no admite elegir proporción");
  });

  test("un fotograma en 4:5 no se anima en silencio: se dicen las salidas posibles; eligiendo formato, sí", () => {
    const motivo = motivoFormatoDelFotograma("4:5", null, veo, ["Kling 3", "Seedance"]);
    expect(motivo).toContain("El fotograma está en 4:5");
    // Las dos salidas que hay en «Crear»: otro modelo, nombrado, o recortar en la biblioteca.
    expect(motivo).toContain("elige otro modelo del clip que la admite (Kling 3, Seedance)");
    expect(motivo).toContain("recórtalo a 9:16 en tu Biblioteca");
    expect(motivo).toContain("No se ha enviado ni reservado nada");
    // Sin alternativas en el catálogo, solo queda recortar: no se ofrece un modelo que no hay.
    expect(motivoFormatoDelFotograma("4:5", null, veo)).not.toContain("elige otro modelo");
    expect(motivoFormatoDelFotograma("4:5", "9:16", veo)).toBeNull();
    expect(motivoFormatoDelFotograma("9:16", null, veo)).toBeNull();
    // Un modelo que no acepta proporción toma la de la imagen: no hay nada que avisar.
    expect(motivoFormatoDelFotograma("4:5", null, hailuo)).toBeNull();
  });

  test("las reservas que no admiten la proporción elegida no se guardan: el relevo no cambia de formato", () => {
    const opcion = (m: ModeloVista) =>
      ({ eleccion: { modelo: m }, entrada: { compatibleId: null }, creditos: 60 }) as unknown as OpcionDeGeneracion;
    const otro = modelo("Otro", ["9:16"]);
    expect(reservasGuardadas([opcion(veo), opcion(otro)], "16:9").reservas?.map((r) => r.modelo)).toEqual(["veo"]);
    expect(reservasGuardadas([opcion(veo), opcion(otro)]).reservas).toHaveLength(2);
    expect(reservasGuardadas([opcion(otro)], "16:9")).toEqual({});
  });
});

describe("lo que el despacho lee del trabajo", () => {
  const fila = (input: Record<string, unknown>, kind: FilaTrabajo["kind"] = "fotograma") =>
    ({ input, kind }) as unknown as FilaTrabajo;

  test("una vista del personaje sale con la suya; lo demás, con la elegida si el modelo la admite", () => {
    expect(proporcionPedidaDe(fila({ vistaSintetica: "frontal" }), veo)).toEqual({ proporcion: "3:4" });
    expect(proporcionPedidaDe(fila({ proporcion: "16:9" }), veo)).toEqual({ proporcion: "16:9" });
    expect(proporcionPedidaDe(fila({}), veo)).toEqual({});
  });

  test("con una elegida que el modelo ya no admite no se envía otra: se devuelve el motivo", () => {
    const resultado = proporcionPedidaDe(fila({ proporcion: "4:5" }, "animacion"), veo);
    expect("error" in resultado && resultado.error).toContain("Veo no admite esa proporción");
  });

  test("el historial enseña la elegida o, en un trabajo de antes, la que se envió", () => {
    expect(proporcionDelTrabajo(fila({ proporcion: "16:9", parametros: { aspect_ratio: "9:16" } }))).toBe("16:9");
    expect(proporcionDelTrabajo(fila({ parametros: { aspect_ratio: "9:16" } }))).toBe("9:16");
    expect(proporcionDelTrabajo(fila({ proporcion: "cualquiera" }))).toBeNull();
  });
});
