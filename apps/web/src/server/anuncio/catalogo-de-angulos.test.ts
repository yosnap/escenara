import { describe, expect, test } from "bun:test";
import { ANGULOS_CON_DECLARACION_DE_FABRICA, ANGULOS_DE_FABRICA, CATEGORIA_ANGULO } from "@/lib/anuncio";
import { CATEGORIAS_PRESET, ETIQUETA_CATEGORIA } from "@/lib/presets";
import { valoresDeTexto } from "../prompts/consulta";
import semilla from "../prompts/presets.json";

/**
 * El **catálogo de los doce ángulos** tal como lo siembra la instalación, sin base de datos.
 *
 * Lo que se comprueba aquí es lo que no puede depender de una consulta: que están los doce con su clave estable,
 * que cada uno trae su definición, por dónde entra y su ejemplo, que la declaración de veracidad la exigen
 * exactamente los cuatro ángulos decididos, y que la categoría **no es** la del ángulo de cámara.
 */

interface PresetSemilla {
  categoria: string;
  clave: string;
  nombre: string;
  descripcion: string;
  orden: number;
  valores: { prompt?: string; porDondeEntra?: string; ejemplo?: string; exigeDeclaracion?: boolean };
}

const angulos = (semilla as { presets: PresetSemilla[] }).presets.filter((p) => p.categoria === CATEGORIA_ANGULO);

describe("el catálogo de ángulos del anuncio", () => {
  test("la categoría es propia y no la del ángulo de cámara de la dirección del clip", () => {
    expect(CATEGORIA_ANGULO).toBe("angulo-anuncio");
    expect(CATEGORIAS_PRESET).toContain("angulo-anuncio");
    // Las dos existen y son distintas: una dice desde dónde mira la cámara y la otra, desde qué dolor entra.
    expect(CATEGORIAS_PRESET).toContain("angulo");
    expect(ETIQUETA_CATEGORIA["angulo-anuncio"]).toBe("Ángulo del anuncio");
    expect(ETIQUETA_CATEGORIA.angulo).toBe("Ángulo");
  });

  test("la semilla trae los doce, en orden y con claves estables sin repetir", () => {
    expect(angulos).toHaveLength(12);
    expect(angulos.map((a) => a.clave)).toEqual([...ANGULOS_DE_FABRICA]);
    expect(new Set(angulos.map((a) => a.orden)).size).toBe(12);
  });

  test("cada ángulo trae su definición, por dónde entra y un ejemplo: es lo que Jev usa de referencia", () => {
    for (const angulo of angulos) {
      expect(angulo.nombre.length).toBeGreaterThan(0);
      // La definición breve en castellano va en la descripción, que es lo que se lee en pantalla.
      expect(angulo.descripcion.length).toBeGreaterThan(10);
      expect(angulo.valores.porDondeEntra?.length ?? 0).toBeGreaterThan(0);
      expect(angulo.valores.ejemplo?.length ?? 0).toBeGreaterThan(0);
      // El fragmento en inglés existe en todos: es lo que entra en la petición al modelo de texto (ADR-0022).
      expect(angulo.valores.prompt?.length ?? 0).toBeGreaterThan(0);
    }
  });

  test("la declaración de veracidad la exigen exactamente mecanismo, beneficio, miedo/pérdida y comparación", () => {
    const conDeclaracion = angulos.filter((a) => a.valores.exigeDeclaracion === true).map((a) => a.clave);
    expect(conDeclaracion.sort()).toEqual([...ANGULOS_CON_DECLARACION_DE_FABRICA].sort());
    // Y los demás no la traen ni como `false`: la bandera solo aparece donde significa algo.
    for (const angulo of angulos.filter((a) => !ANGULOS_CON_DECLARACION_DE_FABRICA.includes(a.clave))) {
      expect(angulo.valores.exigeDeclaracion).toBeUndefined();
    }
  });
});

describe("los valores guardados de un ángulo", () => {
  test("se leen tal cual y la bandera solo es verdadera si de verdad lo es", () => {
    const leidos = valoresDeTexto(
      JSON.stringify({
        prompt: "Opens on the hidden cause",
        porDondeEntra: "El porqué",
        ejemplo: "El culpable son los sulfatos.",
        exigeDeclaracion: true,
      }),
    );
    expect(leidos.porDondeEntra).toBe("El porqué");
    expect(leidos.ejemplo).toBe("El culpable son los sulfatos.");
    expect(leidos.exigeDeclaracion).toBe(true);
  });

  test("lo que no se entiende se descarta y nunca acaba exigiendo una declaración", () => {
    const leidos = valoresDeTexto(
      JSON.stringify({ prompt: "x", porDondeEntra: 42, ejemplo: "", exigeDeclaracion: "sí" }),
    );
    expect(leidos.porDondeEntra).toBeUndefined();
    expect(leidos.ejemplo).toBeUndefined();
    // Una cadena no es `true`: un valor raro no puede convertirse en «este ángulo pide declaración».
    expect(leidos.exigeDeclaracion).toBeUndefined();
  });

  test("los textos en castellano se recortan a su tope y no rompen la lectura", () => {
    const leidos = valoresDeTexto(JSON.stringify({ prompt: "x", porDondeEntra: "a".repeat(400) }));
    expect(leidos.porDondeEntra).toHaveLength(240);
  });
});
