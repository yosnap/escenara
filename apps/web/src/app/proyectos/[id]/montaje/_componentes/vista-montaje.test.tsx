import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EVALUACION_LISTA, REGLAS_VERSION } from "@/lib/controles";
import type { EscenaMontableVista, ExportacionVista, MontajeVista } from "@/lib/montaje";
import { MOTIVO_ETIQUETA_OBLIGATORIA } from "@/lib/montaje";
import { VistaMontaje } from "./vista-montaje";

/**
 * Render de la pantalla de montaje (0.32.0). Se renderiza de verdad con `react-dom/server` y se mira el HTML, no el
 * código: lo que importa es **lo que alguien ve** al abrirla.
 *
 * Cuatro situaciones que no pueden salir mal, porque en las cuatro el usuario se queda sin saber qué hacer si la
 * pantalla calla: sin clips, con el montaje apagado, con la etiqueta obligatoria y con una exportación que ya no
 * corresponde al montaje de ahora.
 */

const escena = (parcial: Partial<EscenaMontableVista> = {}): EscenaMontableVista => ({
  escenaId: "escena-1",
  orden: 1,
  resumen: "Abre el bote y huele el champú.",
  duracionClip: 8,
  medioClip: null,
  tieneVoz: false,
  subtitulos: [],
  ...parcial,
});

const exportacion = (parcial: Partial<ExportacionVista> = {}): ExportacionVista => ({
  id: "exportacion-1",
  estado: "listo",
  etapa: "listo",
  progreso: 100,
  formato: "vertical_9_16",
  ancho: 1080,
  alto: 1920,
  duracion: 18,
  tamano: 6 * 1024 * 1024,
  medio: null,
  etiquetaAplicada: true,
  etiquetaPosicion: "abajo",
  subtitulosQuemados: false,
  tieneSubtitulos: true,
  error: "",
  montajeVersion: 3,
  vigente: true,
  creadoEn: "2026-09-29T10:00:00.000Z",
  terminadoEn: "2026-09-29T10:02:00.000Z",
  ...parcial,
});

const montaje = (parcial: Partial<MontajeVista> = {}): MontajeVista => ({
  proyectoId: "proyecto-1",
  version: 3,
  formato: "vertical_9_16",
  fragmentos: [{ escenaId: "escena-1", entrada: 0, salida: 8 }],
  volumenVoz: 1,
  volumenMusica: 0.4,
  subtitulosQuemados: false,
  formatoSubtitulos: "srt",
  etiquetaVisible: true,
  etiquetaPosicion: "abajo",
  etiquetaObligatoria: false,
  motivoEtiqueta: "",
  duracionTotal: 8,
  escenas: [escena()],
  controles: EVALUACION_LISTA(REGLAS_VERSION),
  activo: true,
  exportaciones: [],
  actualizadoEn: "2026-09-29T09:00:00.000Z",
  ...parcial,
});

const pintar = (parcial: Partial<MontajeVista> = {}) =>
  renderToStaticMarkup(<VistaMontaje inicial={montaje(parcial)} titulo="Champú de verano" />);

describe("un proyecto sin clips", () => {
  const html = pintar({ fragmentos: [], escenas: [escena({ duracionClip: null })], duracionTotal: 0 });

  test("dice qué falta y lleva a producir, en lugar de una línea de tiempo vacía", () => {
    expect(html).toContain("Todavía no hay clips que montar");
    expect(html).toContain("ninguna tiene su clip generado");
    expect(html).toContain("/proyectos/proyecto-1/produccion");
    expect(html).toContain("Ir a producir los clips");
  });

  test("no ofrece ni guardar ni exportar: no habría nada que montar", () => {
    expect(html).not.toContain("Guardar el montaje");
    expect(html).not.toContain("Montar y exportar el MP4");
  });

  test("un proyecto que todavía no tiene escenas lo dice por su nombre", () => {
    const sinEscenas = pintar({ fragmentos: [], escenas: [], duracionTotal: 0 });
    expect(sinEscenas).toContain("no tiene escenas");
  });
});

describe("el montaje apagado en la instalación", () => {
  const html = pintar({ activo: false });

  test("explica qué pasa y quién lo enciende, con el sitio exacto", () => {
    expect(html).toContain("desactivado en esta instalación");
    expect(html).toContain("Admin › Ajustes › Montaje y exportación");
    expect(html).toContain("Lo que ya tengas montado sigue guardado");
  });

  test("la línea de tiempo se sigue viendo, pero guardar y exportar salen deshabilitados", () => {
    expect(html).toContain("La línea de tiempo");
    expect(html).toContain("Guardar el montaje");
    expect(html).toContain("Montar y exportar el MP4");
    // Guardar, exportar, las manecillas del recorte, los volúmenes y la etiqueta: nada se puede tocar.
    const conActivo = pintar();
    const deshabilitados = (marca: string) => marca.match(/disabled=""/g)?.length ?? 0;
    expect(deshabilitados(html)).toBeGreaterThan(deshabilitados(conActivo));
  });
});

describe("la etiqueta obligatoria", () => {
  const html = pintar({ etiquetaObligatoria: true, motivoEtiqueta: MOTIVO_ETIQUETA_OBLIGATORIA });

  test("se dice por qué no se puede quitar, con el motivo del servidor", () => {
    expect(html).toContain(MOTIVO_ETIQUETA_OBLIGATORIA);
    expect(html).toContain("En este proyecto no se puede apagar");
  });

  test("el interruptor está encendido y deshabilitado: no hay forma de apagarlo desde la pantalla", () => {
    // El interruptor de Base UI marca su estado en el atributo `data-checked` del botón.
    expect(html).toContain("data-checked");
    expect(html).toContain("disabled=");
  });

  test("sin personaje con apariencia real no aparece ningún motivo ni ninguna cerradura", () => {
    const suelta = pintar();
    expect(suelta).not.toContain(MOTIVO_ETIQUETA_OBLIGATORIA);
    expect(suelta).not.toContain("En este proyecto no se puede apagar");
  });
});

describe("el panel de exportación", () => {
  test("dice que no cuesta créditos, porque es lo primero que alguien se pregunta", () => {
    const html = pintar();
    expect(html).toContain("No cuesta créditos");
    expect(html).toContain("no se llama a ningún proveedor");
  });

  test("una exportación de la versión de ahora se marca como vigente", () => {
    const html = pintar({ exportaciones: [exportacion({ montajeVersion: 3, vigente: true })] });
    expect(html).toContain("Corresponde al montaje de ahora");
    expect(html).not.toContain("De una versión anterior del montaje");
  });

  test("una exportación de una versión anterior lo dice, con las dos versiones", () => {
    const html = pintar({ version: 5, exportaciones: [exportacion({ montajeVersion: 3, vigente: false })] });
    expect(html).toContain("De una versión anterior del montaje");
    expect(html).toContain("la 3");
    expect(html).toContain("ahora vas por la 5");
  });

  test("un fallo del render se muestra con su causa, no con un «no se ha podido»", () => {
    const html = pintar({
      exportaciones: [exportacion({ estado: "fallido", etapa: "montando", error: "FFmpeg no está instalado." })],
    });
    expect(html).toContain("FFmpeg no está instalado.");
    expect(html).toContain("Ha fallado");
  });

  test("un freno de la comprobación previa se ve con su motivo y su acción", () => {
    const html = pintar({
      controles: {
        estado: "bloqueado",
        reglasVersion: REGLAS_VERSION,
        comprobaciones: [
          {
            regla: "montaje-criticos",
            estado: "bloqueado",
            motivo: "La revisión de continuidad tiene 2 fallos críticos abiertos.",
            accion: "Resuélvelos en la revisión y vuelve a exportar.",
            enlace: "/proyectos/proyecto-1/revision",
            confirmable: false,
          },
        ],
      },
    });
    expect(html).toContain("2 fallos críticos abiertos");
    expect(html).toContain("Resuélvelos en la revisión");
    expect(html).toContain("/proyectos/proyecto-1/revision");
  });
});
