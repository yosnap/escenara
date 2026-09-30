import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DIRECCION_CON_ACENTO_VACIA, type OpcionesDeDireccion } from "@/lib/direccion";
import type { TrendDeLaDireccion } from "./decidido-por-trend";
import { PanelDireccion } from "./panel-direccion";

/**
 * **Cada concepto se elige en un solo sitio** (0.25.2), comprobado sobre el HTML que acaba en la pantalla y no
 * sobre el código fuente.
 *
 * El bloque «El fotograma» —óptica, luz y sitio— solo tiene sentido donde esta pantalla **genera** el
 * fotograma, que es la escena de un proyecto. En «Crear» no: o el fotograma es una imagen que ya tienes (no se
 * genera nada) o tiene su propio paso, donde esos campos ya se eligen.
 *
 * El registro estético no se va con ellos: modula la cámara del clip y llega a su prompt, así que se queda
 * siempre, y **una sola vez**.
 */

const OPCIONES: OpcionesDeDireccion = {
  plano: [{ clave: "primer-plano", nombre: "Primer plano", descripcion: "De los hombros a la cabeza." }],
  angulo: [{ clave: "tres-cuartos", nombre: "Tres cuartos", descripcion: "Ni de frente ni de perfil." }],
  optica: [{ clave: "retrato-85", nombre: "Retrato 85 mm", descripcion: "Fondo desenfocado." }],
  luz: [{ clave: "ventana", nombre: "Luz de ventana", descripcion: "Luz suave de lado." }],
  localizacion: [{ clave: "cocina", nombre: "Cocina", descripcion: "Una cocina luminosa." }],
  camara: [{ clave: "push-in-ojos", nombre: "Acercarse a los ojos", descripcion: "La cámara se acerca." }],
  microaccion: [{ clave: "asentir", nombre: "Asentir", descripcion: "Asiente una vez." }],
  accionProducto: [],
};

const pintar = (conFotograma: boolean) =>
  renderToStaticMarkup(
    <PanelDireccion
      direccion={DIRECCION_CON_ACENTO_VACIA}
      opciones={OPCIONES}
      guion="Hola, te cuento una cosa."
      segundos={8}
      conAcento
      conFotograma={conFotograma}
      onCambio={() => {}}
    />,
  );

/** Cuántas veces aparece un rótulo en la pantalla. Dos = el mismo concepto pedido dos veces. */
const veces = (html: string, rotulo: string): number => html.split(rotulo).length - 1;

describe("el panel de dirección no pide dos veces lo mismo", () => {
  test("en «Crear» no se enseña el bloque del fotograma: ahí no se genera ninguno", () => {
    const html = pintar(false);
    expect(html).not.toContain("El fotograma");
    expect(html).not.toContain("Óptica");
    expect(html).not.toContain(">Luz<");
    expect(html).not.toContain(">Sitio<");
    // Lo que sí es del clip sigue estando, y una sola vez.
    expect(veces(html, "Registro estético")).toBe(1);
    expect(veces(html, "Movimiento de cámara")).toBe(1);
    expect(veces(html, "Primer plano")).toBe(1);
  });

  test("en la escena de un proyecto sí, porque ahí el fotograma se genera con estas 6C", () => {
    const html = pintar(true);
    expect(html).toContain("El fotograma");
    expect(html).toContain("Óptica");
    expect(html).toContain(">Luz<");
    expect(html).toContain(">Sitio<");
    expect(veces(html, "Registro estético")).toBe(1);
  });
});

describe("con un trend, lo que decide él no se pregunta", () => {
  const conTrend = (decide: TrendDeLaDireccion["decide"], permiteHabla = false, modoExperto = false) =>
    renderToStaticMarkup(
      <PanelDireccion
        direccion={{ ...DIRECCION_CON_ACENTO_VACIA, modoExperto, plano: "primer-plano", camara: "push-in-ojos" }}
        opciones={OPCIONES}
        guion="Hola, te cuento una cosa."
        segundos={8}
        conAcento
        conFotograma={false}
        trend={{ nombre: "Unboxing", decide, permiteHabla }}
        onCambio={() => {}}
      />,
    );

  test("las categorías decididas salen bloqueadas con su motivo escrito y sin sus controles", () => {
    const html = conTrend(["plano", "camara"]);
    expect(html).toContain("Lo decide el trend «Unboxing»");
    expect(html).toContain("data-decidido-por-trend");
    // El control de plano y el de cámara no se pintan: ni su tarjeta ni su pregunta.
    expect(html).not.toContain("Cuánto se le ve en el encuadre.");
    expect(html).not.toContain("Solo uno por clip");
    expect(html).not.toContain("Acercarse a los ojos");
    // Lo decidido sale nombrado en el bloque, una vez.
    expect(veces(html, ">Plano<")).toBe(1);
    expect(veces(html, ">Movimiento de cámara<")).toBe(1);
    // Lo demás sigue libre.
    expect(html).toContain("Desde dónde le mira la cámara.");
    expect(html).toContain('text-texto">Micro-acción</div>');
    expect(html).toContain('text-texto">Registro estético</div>');
    expect(html).toContain("Instrucciones adicionales");
    // El resumen no promete lo que no se va a enviar.
    expect(html).not.toContain("cámara quieta");
    expect(html).toContain("lo que decide el trend «Unboxing»");
  });

  test("el gesto y el registro también se pueden dejar en manos del trend", () => {
    const html = conTrend(["microaccion", "registro-estetico"]);
    // Sus selectores no se pintan (el rótulo del desplegable ni el valor elegido del registro).
    expect(html).not.toContain('text-texto">Registro estético</div>');
    expect(html).not.toContain("Real y cercano (UGC)");
    expect(html).not.toContain('text-texto">Micro-acción</div>');
    expect(html).not.toContain("Cuándo ocurre el gesto");
    // Salen en el bloque del trend, y el encuadre sigue libre.
    expect(html).toContain("Su texto ya dicta micro-acción y registro estético");
    expect(html).toContain("Cuánto se le ve en el encuadre.");
  });

  test("sin habla no se pide la voz, y no hay modo experto aunque viniera marcado", () => {
    const html = conTrend([], false, true);
    expect(html).not.toContain("Cómo lo dice");
    expect(html).not.toContain(">Acento<");
    expect(html).toContain("No se puede con el trend «Unboxing»");
    // La casilla desactivada lleva el motivo en su descripción accesible: apunta a la alerta que lo dice.
    // `aria-describedby` puede llevar varios ids (la descripción de la casilla y el motivo): se miran uno a uno.
    const describida =
      html.match(/aria-describedby="([^"]+)"/g)?.flatMap((m) => m.slice(18, -1).split(" ")) ?? [];
    const motivo = describida.find((id) => html.includes(`id="${id}" data-alerta="info"`));
    expect(motivo).toBeTruthy();
    expect(html).not.toContain("Tu descripción del clip");
    // Sin nada decidido no hay bloque de bloqueo.
    expect(html).not.toContain("data-decidido-por-trend");
  });

  test("con habla, la voz sigue siendo tuya", () => {
    const html = conTrend(["plano"], true);
    expect(html).toContain("Cómo lo dice");
  });
});
