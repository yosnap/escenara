import { describe, expect, it } from "bun:test";
import path from "node:path";

/**
 * Norma del propietario (0.10.0): donde se **ve** un medio (no donde se lista en miniatura de cuadrícula)
 * nunca se recorta. Un vertical 9:16 se ve entero, también a pantalla completa.
 *
 * Es un test de código a propósito: la suite no monta React, así que se comprueba la garantía en la fuente,
 * igual que con el `<select>` nativo o los bordes laterales.
 */
const RAIZ = path.resolve(import.meta.dir, "..");

/** Ficheros que muestran un medio a tamaño grande. */
const VISORES = [
  "components/ui/media/visor-medio.tsx",
  "components/ui/media/editor-metadatos.tsx",
  "app/crear/_componentes/resultado-trabajo.tsx",
];

const leer = (relativa: string) => Bun.file(path.join(RAIZ, relativa)).text();

describe("el medio se ve completo", () => {
  it("ningún visor recorta con object-cover", async () => {
    const infractores: string[] = [];
    for (const relativa of VISORES) {
      if ((await leer(relativa)).includes("object-cover")) infractores.push(relativa);
    }
    expect(infractores).toEqual([]);
  });

  it("el visor fija la proporción real del medio y usa object-contain", async () => {
    const codigo = await leer("components/ui/media/visor-medio.tsx");
    expect(codigo).toContain("aspectRatio");
    expect(codigo).toContain("medio.ancho");
    expect(codigo).toContain("medio.alto");
    expect(codigo).toContain("object-contain");
    // El ancho sale de la proporción y la altura la limita la ventana.
    expect(codigo).toContain("maxHeight");
  });

  it("la miniatura deja que quien la usa decida el ajuste, también en vídeo", async () => {
    const codigo = await leer("components/ui/media/miniatura-medio.tsx");
    // El vídeo ignoraba `className` y salía siempre recortado: esta es la regresión que se vigila.
    const bloqueVideo = codigo.slice(codigo.indexOf('medio.tipo === "video"'));
    // Importa que el ajuste del vídeo se componga con `className`, no cómo quede formateada la llamada.
    const claseDelVideo = bloqueVideo.match(/className=\{cn\(([^)]*)\)\}/);
    expect(claseDelVideo).not.toBeNull();
    expect(claseDelVideo?.[1]).toContain("className");
  });

  it("donde se muestra un medio generado se pide sin recortar", async () => {
    expect(await leer("app/crear/_componentes/resultado-trabajo.tsx")).toContain("VisorMedio");
    expect(await leer("app/crear/historial/_componentes/lista-trabajos.tsx")).toContain("object-contain");
  });
});
