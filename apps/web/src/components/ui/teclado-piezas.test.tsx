import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { auditar } from "@/lib/axe-de-prueba";
import { encuadreAutomatico } from "@/lib/formatos";
import type { Medio } from "@/lib/media/tipos";
import { moverEncuadreConTecla, PASO_ENCUADRE_TECLADO } from "@/lib/montaje-pantalla";
import type { EscenaVozVista } from "@/lib/voz";

/**
 * **Todo lo complejo se puede hacer con el teclado.** Lógica y marcado de las piezas que más fácil lo pierden: el
 * encuadre del montaje (arrastre con alternativa de flechas y botones), el selector de medios, la captura guiada y el
 * editor de subtítulos (con sus errores ligados al campo).
 *
 * La lista ordenable (asa con Espacio, flechas y Escape), el flujo por pasos y la alerta con «Ir al campo» tienen sus
 * propios tests de teclado en `lista-ordenable.test.tsx`, `multipaso.test.tsx` y `llevar-al-problema.test.ts`.
 */

const navegacion = await import("next/navigation");
mock.module("next/navigation", () => ({ ...navegacion, useRouter: () => ({ refresh() {} }) }));

const { PrevisualizacionFormato } = await import("./montaje/previsualizacion-formato");
const { ControlEncuadre } = await import("./montaje/control-encuadre");
const { SelectorMedios } = await import("./media/selector-medios");
const { VisorCaptura } = await import("./personajes/visor-captura");
const { EditorSubtitulos } = await import("@/app/proyectos/[id]/voz/_componentes/editor-subtitulos");

describe("encuadre del montaje por teclado", () => {
  test("cada flecha mueve un paso en su eje y nunca se sale de los bordes", () => {
    const p = { x: 50, y: 50 };
    expect(moverEncuadreConTecla(p, "ArrowLeft")).toEqual({ x: 50 - PASO_ENCUADRE_TECLADO, y: 50 });
    expect(moverEncuadreConTecla(p, "ArrowRight")).toEqual({ x: 50 + PASO_ENCUADRE_TECLADO, y: 50 });
    expect(moverEncuadreConTecla(p, "ArrowUp")).toEqual({ x: 50, y: 50 - PASO_ENCUADRE_TECLADO });
    expect(moverEncuadreConTecla(p, "ArrowDown")).toEqual({ x: 50, y: 50 + PASO_ENCUADRE_TECLADO });
    expect(moverEncuadreConTecla({ x: 2, y: 98 }, "ArrowLeft")).toEqual({ x: 0, y: 98 });
    expect(moverEncuadreConTecla({ x: 2, y: 98 }, "ArrowDown")).toEqual({ x: 2, y: 100 });
  });

  test("las demás teclas siguen haciendo lo suyo (Tab, Intro, Espacio)", () => {
    for (const tecla of ["Tab", "Enter", " ", "a", "Escape"])
      expect(moverEncuadreConTecla({ x: 5, y: 5 }, tecla)).toBeNull();
  });

  test("el vídeo encuadrable es un botón con foco que dice cómo se mueve y dónde está", () => {
    const html = renderToStaticMarkup(
      <PrevisualizacionFormato
        formato="cuadrado_1_1"
        src="/api/media/c1"
        medidas={{ ancho: 1080, alto: 1920 }}
        encuadre={{ modo: "recorte", x: 30, y: 60 }}
        onEncuadre={() => {}}
      />,
    );
    expect(html).toMatch(
      /<button type="button" aria-label="Encuadre en [^"]+: arrastra el vídeo o usa las flechas\. Horizontal 30 %, vertical 60 %\."/,
    );
    // Sin poder encuadrar no hay botón encima, y el vídeo conserva sus controles.
    const soloVer = renderToStaticMarkup(<PrevisualizacionFormato formato="cuadrado_1_1" src="/api/media/c1" />);
    expect(soloVer).not.toContain("<button");
    expect(soloVer).toContain("controls");
  });

  test("los encuadres preparados son botones con su estado y hay vuelta a automático", async () => {
    const html = renderToStaticMarkup(
      <ControlEncuadre
        formato="cuadrado_1_1"
        encuadre={{ modo: "recorte", x: 30, y: 60 }}
        ajustado
        medidas={{ ancho: 1080, alto: 1920 }}
        onCambio={() => {}}
      />,
    );
    expect(html).toContain('<legend class="sr-only">Encuadre</legend>');
    expect(html.match(/aria-pressed="(true|false)"/g)?.length).toBeGreaterThan(1);
    expect(html).toContain("Volver a automático");
    expect(html).toContain("con el foco en él, muévelo con las flechas");
    expect((await auditar(html, { fragmento: true })).graves).toEqual([]);
    expect(encuadreAutomatico("cuadrado_1_1")).toBeTruthy();
  });
});

describe("selector de medios", () => {
  test("subir, elegir y pegar una URL son botones; la biblioteca no se descarga hasta abrirla", async () => {
    const html = renderToStaticMarkup(
      <SelectorMedios etiqueta="Foto de partida" valor={[]} onCambio={() => {}} tipos={["imagen"]} />,
    );
    expect(html).toContain('<fieldset aria-label="Zona para soltar archivos"');
    for (const accion of ["Subir desde el equipo", "Elegir de la biblioteca", "Desde una URL"]) {
      expect(html).toMatch(new RegExp(`<button[^>]*>(?:<svg.*?</svg>)?${accion}</button>`));
    }
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>(?:<svg.*?<\/svg>)?Desde una URL/);
    // Cerrado, el diálogo de la biblioteca no está ni en el HTML ni en el JavaScript de la página.
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("Cargando tu biblioteca");
    expect((await auditar(html, { fragmento: true })).graves).toEqual([]);
  });
});

describe("captura guiada", () => {
  test("encender la cámara es un botón y subir una foto un campo de archivo que se alcanza con Tab", async () => {
    const html = renderToStaticMarkup(
      <VisorCaptura
        personajeId="p1"
        tipo="persona"
        vista="frontal"
        umbrales={{ ladoMinimo: 768, nitidezMinima: 60, luminosidadMinima: 40, luminosidadMaxima: 220, caraMinima: 20 }}
        onAnadida={() => {}}
      />,
    );
    expect(html).toMatch(/<button[^>]*>(?:<svg.*?<\/svg>)?Encender la cámara<\/button>/);
    // El campo va oculto a la vista (sr-only), no al teclado: ni `hidden` ni `display:none`, y la etiqueta enseña el foco.
    const campo = html.match(/<input type="file"[^>]*>/)?.[0] ?? "";
    expect(campo).toContain('class="sr-only"');
    expect(campo).not.toMatch(/hidden|tabindex="-1"/);
    expect(html).toMatch(/<label class="[^"]*focus-within:outline-2[^"]*"/);
    expect((await auditar(html, { fragmento: true })).graves).toEqual([]);
  });
});

describe("editor de subtítulos", () => {
  const escena = (subtitulos: EscenaVozVista["subtitulos"]): EscenaVozVista =>
    ({
      id: "e1",
      orden: 1,
      resumen: "Saluda",
      segundos: 6,
      dialogo: "Hola",
      clip: null as Medio | null,
      audio: null,
      invalidada: false,
      clipHablado: false,
      sinAudio: false,
      invalidacion: "",
      subtitulos,
    }) as EscenaVozVista;

  test("cada campo tiene nombre y sus errores y avisos se leen al llegar a él", async () => {
    const html = renderToStaticMarkup(
      <EditorSubtitulos
        escena={escena([
          { desde: 0, hasta: 2, texto: "Hola, soy Ana" },
          { desde: 3, hasta: 2.5, texto: "" },
        ])}
        ocupado={false}
        onGuardar={() => {}}
      />,
    );
    // La segunda línea acaba antes de empezar (tiempos) y está vacía (texto): cada error, en su campo.
    const describe = (etiqueta: RegExp) => {
      const control = html.match(etiqueta)?.[0] ?? "";
      const ids = control.match(/aria-describedby="([^"]+)"/)?.[1]?.split(" ") ?? [];
      return { control, textos: ids.map((id) => html.match(new RegExp(`id="${id}"[^>]*>([^<]+)<`))?.[1]) };
    };
    const texto = describe(/<textarea[^>]*aria-label="Texto del subtítulo 2"[^>]*>/);
    expect(texto.control).toContain('aria-invalid="true"');
    expect(texto.textos).toContain("El subtítulo 2 está vacío.");
    const tiempos = [...html.matchAll(/<input[^>]*type="number"[^>]*>/g)].map((m) => m[0]);
    expect(tiempos).toHaveLength(4);
    const hasta2 = tiempos[3] ?? "";
    expect(hasta2).toContain('aria-invalid="true"');
    // La primera línea está bien: sin aria-invalid.
    expect(tiempos[0]).not.toContain(`aria-invalid="true"`);
    expect((await auditar(html, { fragmento: true })).graves).toEqual([]);
  });
});
