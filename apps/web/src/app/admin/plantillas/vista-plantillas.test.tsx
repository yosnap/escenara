import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PlantillaVista } from "@/lib/presets";
import { VistaPlantillas } from "./vista-plantillas";

/**
 * Render de la lista de plantillas: una lista ordenable por capacidad (el orden solo importa dentro de ella),
 * con asa enfocable y con nombre, ayuda de teclado y Subir/Bajar como alternativa.
 */

const plantilla = (
  id: string,
  capacidad: PlantillaVista["capacidad"],
  nombre: string,
  orden: number,
): PlantillaVista => ({
  id,
  clave: id,
  nombre,
  descripcion: `Descripción de ${nombre}`,
  kind: "base",
  trendStatus: null,
  trendSince: null,
  trendPlatform: "",
  targetSeconds: null,
  referenceUrl: "",
  trendAllowsSpeech: false,
  capacidad,
  plantilla: "Escena: {{escena}}",
  variables: [],
  restricciones: { modelos: [], minimoReferencias: 0 },
  version: 1,
  versionId: `${id}-v1`,
  orden,
  activa: true,
  deLaInstalacion: true,
  duplicadaDe: null,
  actualizado: "2026-09-30T10:00:00.000Z",
});

const INICIAL = [
  plantilla("t1", "image_edit", "Fotograma base", 10),
  plantilla("t2", "image_edit", "Fotograma de perfil", 20),
  plantilla("t3", "image_to_video", "Clip base", 10),
];

describe("plantillas de la instalación", () => {
  const html = renderToStaticMarkup(<VistaPlantillas inicial={INICIAL} />);

  test("cada plantilla tiene su asa enfocable con nombre", () => {
    expect(html).toContain('aria-label="Cambiar el orden de Fotograma base"');
    expect(html).toContain('aria-label="Cambiar el orden de Clip base"');
  });

  test("una lista por capacidad", () => {
    expect(html.match(/<ol aria-label="Plantillas de /g)).toHaveLength(2);
  });

  test("dice cómo se coge y se suelta con el teclado", () => {
    expect(html).toContain("Espacio para coger");
  });

  test("Subir y Bajar siguen ahí, con el nombre de la plantilla", () => {
    expect(html).toContain('aria-label="Subir Fotograma de perfil"');
    expect(html).toContain('aria-label="Bajar Fotograma base"');
  });

  test("el número de orden ya no se enseña", () => {
    expect(html).not.toContain("orden #");
  });
});
