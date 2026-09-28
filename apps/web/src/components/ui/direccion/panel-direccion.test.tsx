import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DIRECCION_CON_ACENTO_VACIA, type OpcionesDeDireccion } from "@/lib/direccion";
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
