import { afterEach, beforeEach, expect, test } from "bun:test";
import type { LugarVista } from "@/lib/lugares";
import type { Medio } from "@/lib/media/tipos";
import { montarPantalla, type PantallaDePrueba } from "@/lib/pantalla-de-prueba";
import { DeclaracionLugar } from "./declaracion-lugar";

/**
 * **Las casillas de la declaración de un lugar**: con una declaración vigente salen como se declararon, para que no
 * parezca que no se guardó; sin ella salen vacías y hay que marcarlas antes de declarar.
 */
const MEDIO = { id: "m1", titulo: "Patio", nombre: "patio.jpg", tipo: "imagen" } as unknown as Medio;
const lugar = (cambios: Partial<LugarVista> = {}): LugarVista => ({
  id: "l1",
  nombre: "Patio de la abuela",
  descripcion: "Patio andaluz con azulejos azules y macetas.",
  acabado: "realista",
  estilo: "",
  fotos: 1,
  portada: null,
  tieneMaestra: true,
  declarado: false,
  version: 1,
  actualizado: "2026-10-17T00:00:00.000Z",
  referencias: [{ id: "r1", papel: "maestra", generada: true, orden: 0, medio: MEDIO }],
  declaracion: null,
  versiones: [],
  ...cambios,
});
const DECLARADO = lugar({
  declarado: true,
  declaracion: {
    id: "d1",
    origenFotos: "generadas",
    alcance: "personal",
    espacio: "exterior",
    puedoUsarImagenes: true,
    personasVisibles: "ninguna",
    marcasVisibles: false,
    declaradaEn: "2026-10-17T00:00:00.000Z",
  },
});

let pantalla: PantallaDePrueba;
beforeEach(() => {
  pantalla = montarPantalla("http://localhost/lugares/l1");
});
afterEach(async () => {
  await pantalla.desmontar();
});

/** Estado de cada casilla por su etiqueta. */
const casillas = () =>
  Object.fromEntries(
    [...pantalla.ventana.document.querySelectorAll("label")].map(
      (l) => [l.textContent ?? "", l.querySelector("[data-checked]") !== null] as const,
    ),
  );
const marcada = (inicio: string) => Object.entries(casillas()).find(([texto]) => texto.startsWith(inicio))?.[1] ?? null;

test("con la declaración vigente, las casillas declaradas salen marcadas", async () => {
  await pantalla.pintar(<DeclaracionLugar lugar={DECLARADO} onCambio={() => {}} />);
  expect(pantalla.texto()).toContain("Declarada el");
  expect(marcada("Puedo usar estas imágenes")).toBe(true);
  expect(marcada("En estas fotos no sale ningún menor")).toBe(true);
  expect(marcada("Se ve alguna marca")).toBe(false);
  expect(pantalla.botones()).toContain("Volver a declarar");
});

test("sin declaración, las casillas salen vacías y no se puede declarar", async () => {
  await pantalla.pintar(<DeclaracionLugar lugar={lugar()} onCambio={() => {}} />);
  expect(marcada("Puedo usar estas imágenes")).toBe(false);
  expect(marcada("En estas fotos no sale ningún menor")).toBe(false);
  const declarar = [...pantalla.ventana.document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === "Declarar",
  );
  expect(declarar?.disabled).toBe(true);
});
