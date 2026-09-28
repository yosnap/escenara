import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PROYECTO_SIN_BRIEF, TEXTO_DECLARACION_VERACIDAD } from "@/lib/anuncio";
import type { ProyectoDetalle } from "@/lib/proyectos";
import type { DatosDelAnuncio } from "@/server/anuncio/pantalla";
import { PanelBrief } from "./panel-brief";

/**
 * Render del paso del brief (criterio de aceptación de la 0.27.0): **un proyecto sin brief sigue funcionando como
 * antes de esta versión**.
 *
 * Se renderiza de verdad con `react-dom/server` y se mira el HTML, no el código fuente: lo que importa es lo que
 * alguien ve. Y lo que tiene que ver sin brief es una invitación, no un formulario obligatorio, ni un aviso de que
 * algo está mal, ni ningún botón que gaste.
 */

const proyecto = {
  id: "proyecto-1",
  titulo: "Champú de verano",
  formato: "reel" as ProyectoDetalle["proyecto"]["formato"],
} as ProyectoDetalle["proyecto"];

const datos = (parcial: Partial<DatosDelAnuncio> = {}): DatosDelAnuncio => ({
  activo: true,
  variantesActivas: true,
  brief: null,
  angulos: [
    {
      clave: "mecanismo",
      nombre: "Mecanismo",
      definicion: "Entra por la causa oculta.",
      porDondeEntra: "El porqué",
      ejemplo: "El culpable son los sulfatos.",
      exigeDeclaracion: true,
    },
  ],
  ofertas: [],
  productos: [{ id: "producto-1", nombre: "Champú" }],
  puerta: { puede: true, motivo: "", faltaDeclaracion: false },
  estimacion: {
    hayEntradas: true,
    motivo: "",
    creditos: 3,
    porCuota: false,
    sello: "nan:gemma4:texto@v1",
    nombreProveedor: "NaN builders",
    modelo: "gemma4",
    admiteImagen: false,
  },
  hooksPedidos: 5,
  hooksGuardados: null,
  anguloFiel: null,
  modoAnguloFiel: "sombra",
  ...parcial,
});

const pintar = (parcial: Partial<DatosDelAnuncio> = {}) =>
  renderToStaticMarkup(
    <PanelBrief proyecto={proyecto} datos={datos(parcial)} onError={() => undefined} onRecargar={() => undefined} />,
  );

describe("un proyecto sin brief", () => {
  const html = pintar();

  test("dice que puede seguir escribiendo el guion a mano, como hasta ahora", () => {
    expect(html).toContain(PROYECTO_SIN_BRIEF.slice(0, 60));
    expect(html).toContain("Escribir el brief de este anuncio");
  });

  test("no ofrece nada que gaste: sin brief no hay hooks que pedir ni variantes que crear", () => {
    expect(html).not.toContain("estimación");
    expect(html).not.toContain("hooks y el guion");
    expect(html).not.toContain("Crear");
  });

  test("no pinta ningún formulario ni ninguna obligación: no cambia el camino de siempre", () => {
    expect(html).not.toContain("El ángulo, uno solo");
    expect(html).not.toContain(TEXTO_DECLARACION_VERACIDAD);
    // Ningún tono de error ni de aviso: no tener brief no es un problema que haya que resolver.
    expect(html).not.toContain('role="alert"');
  });
});

describe("con el brief apagado por quien administra", () => {
  const html = pintar({ activo: false, brief: null });

  test("se explica en una frase y no se ofrece nada", () => {
    expect(html).toContain("está apagado en esta instalación");
    expect(html).toContain("Ajustes");
    expect(html).not.toContain("Escribir el brief de este anuncio");
  });
});

describe("con brief y un ángulo que afirma algo comprobable", () => {
  const html = pintar({
    brief: {
      proyectoId: "proyecto-1",
      productoId: "producto-1",
      productoNombre: "Champú",
      publico: "Quien tiene el pelo rizado",
      versionMejor: "Salir de casa sin pensar en el pelo",
      angulo: "mecanismo",
      anguloVista: {
        clave: "mecanismo",
        nombre: "Mecanismo",
        definicion: "Entra por la causa oculta.",
        porDondeEntra: "El porqué",
        ejemplo: "El culpable son los sulfatos.",
        exigeDeclaracion: true,
      },
      ofertaId: null,
      oferta: null,
      notas: "",
      declaracionRegistrada: false,
      actualizado: "2026-09-28T10:00:00.000Z",
    },
  });

  test("enseña el ángulo con su ejemplo y pide la declaración con el texto entero", () => {
    expect(html).toContain("Mecanismo");
    expect(html).toContain("El culpable son los sulfatos.");
    expect(html).toContain(TEXTO_DECLARACION_VERACIDAD);
  });

  test("dice lo que cuesta pedir los hooks, con la palabra estimación y el proveedor", () => {
    expect(html).toContain("estimación");
    expect(html).toContain("NaN builders");
  });
});
