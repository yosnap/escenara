import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ClipProducidoVista } from "@/lib/audio-del-clip";
import type { Medio } from "@/lib/media/tipos";
import { TarjetaClipProducido, TarjetaConvertirEnProyecto } from "./conversion";

/**
 * Render del botón «Convertir en proyecto» y de la tarjeta del clip producido (0.35.0). Se mira el HTML que ve la
 * persona: que el botón nunca desaparece sin decir por qué, que explica que no se paga otra vez y que la tarjeta
 * ofrece las dos acciones de audio y el camino al montaje.
 */

describe("el botón Convertir en proyecto", () => {
  test("explica qué pasa y que no se cobra otra vez", () => {
    const html = renderToStaticMarkup(<TarjetaConvertirEnProyecto estado={{ estado: "convertible", avisos: [] }} />);
    expect(html).toContain("Convertir en proyecto");
    expect(html).toContain("No se vuelve a generar ni se cobra otra vez");
    expect(html).not.toContain('disabled=""');
  });

  test("si no se puede, sale deshabilitado y con el motivo", () => {
    const html = renderToStaticMarkup(
      <TarjetaConvertirEnProyecto
        estado={{ estado: "no_convertible", motivo: "El clip todavía se está generando." }}
      />,
    );
    expect(html).toContain("Convertir en proyecto");
    expect(html).toContain('disabled=""');
    expect(html).toContain("El clip todavía se está generando.");
  });

  test("mientras se comprueba no se puede pulsar", () => {
    const html = renderToStaticMarkup(<TarjetaConvertirEnProyecto estado={null} />);
    expect(html).toContain('disabled=""');
    expect(html).toContain("Comprobando");
  });

  test("ya convertido lleva a su proyecto en vez de crear otro", () => {
    const html = renderToStaticMarkup(
      <TarjetaConvertirEnProyecto
        estado={{ estado: "convertido", proyectoId: "p1", titulo: "Mi clip", url: "/proyectos/p1?paso=escenas" }}
      />,
    );
    expect(html).toContain("Abrir su proyecto");
    expect(html).toContain("/proyectos/p1?paso=escenas");
    expect(html).toContain("no se crea otro");
    expect(html).not.toContain(">Convertir en proyecto<");
  });

  test("los avisos del clip convertible se enseñan", () => {
    const html = renderToStaticMarkup(
      <TarjetaConvertirEnProyecto estado={{ estado: "convertible", avisos: ["El trend ha caducado."] }} />,
    );
    expect(html).toContain("El trend ha caducado.");
  });
});

const clip = (parcial: Partial<ClipProducidoVista> = {}): ClipProducidoVista => ({
  escenaId: "e1",
  orden: 1,
  medio: { id: "m1", url: "/clip.mp4" } as Medio,
  hablaEnElClip: true,
  audioQuitado: false,
  conPistaDeVoz: false,
  conDialogo: true,
  ...parcial,
});

describe("la tarjeta del clip producido", () => {
  const html = renderToStaticMarkup(<TarjetaClipProducido clip={clip()} modoVoz="clip" proyectoId="p1" />);

  test("enseña el clip y dice qué se va a oír", () => {
    expect(html).toContain("/clip.mp4");
    expect(html).toContain("la voz que trae el propio clip");
  });

  test("ofrece quitar el audio del clip y explica que no cuesta nada", () => {
    expect(html).toContain("Quitar el audio del clip");
    expect(html).toContain("no cuesta nada");
  });

  test("explica cómo ponerle voz en off y lleva a Voz y a Montaje", () => {
    expect(html).toContain("Para ponerle voz en off");
    expect(html).toContain("/proyectos/p1/voz");
    expect(html).toContain("/proyectos/p1/montaje");
  });

  test("con el audio quitado lo dice", () => {
    const quitado = renderToStaticMarkup(
      <TarjetaClipProducido clip={clip({ audioQuitado: true })} modoVoz="clip" proyectoId="p1" />,
    );
    expect(quitado).toContain("Sin el audio del clip");
  });
});
