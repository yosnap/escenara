import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FICHA_VACIA } from "@/lib/ficha-personaje";
import type { PersonajeVista } from "@/lib/personajes";
import { PanelFicha } from "./panel-ficha";

/**
 * Guardar la ficha de un personaje inventado no puede tocar su estilo si no ha cambiado: el estilo es lo que, al
 * cambiar, descarta su cara. Y un cambio de estilo de verdad se avisa y se confirma antes de enviar nada.
 */

let ventana: Window;
let raiz: Root;
let peticion: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
const anteriores = new Map<string, PropertyDescriptor | undefined>();

const personaje = {
  id: "p1",
  nombre: "Brisa",
  tipo: "persona",
  especie: "",
  descripcion: "Mujer de treinta años, pelo rizado.",
  ficha: { ...FICHA_VACIA },
  versionVigente: { id: "v1", numero: 1, creadaEn: new Date().toISOString(), hoja: null },
  inventado: true,
  estiloAnimado: "anime",
  guiaEstilo: { paleta: "pasteles", trazo: "", detalle: "", referencias: [] },
  fotogramaMaestro: { id: "m1", url: "/cara.png" },
  esteticaDeModelo: false,
  hojaIdentidad: null,
  probarHojaIdentidad: false,
  totalReferencias: 3,
  totalGeneradas: 3,
  referencias: [],
} as unknown as PersonajeVista;

const ESTILOS = [{ clave: "anime", nombre: "Anime", descripcion: "" }];

beforeEach(() => {
  ventana = new Window({ url: "http://localhost/personajes/p1" });
  for (const [clave, valor] of Object.entries({
    window: ventana,
    document: ventana.document,
    navigator: ventana.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
    HTMLElement: ventana.HTMLElement,
    Element: ventana.Element,
    Node: ventana.Node,
    getComputedStyle: ventana.getComputedStyle.bind(ventana),
    requestAnimationFrame: (f: () => void) => {
      f();
      return 0;
    },
    cancelAnimationFrame: () => {},
  })) {
    anteriores.set(clave, Object.getOwnPropertyDescriptor(globalThis, clave));
    Object.defineProperty(globalThis, clave, { value: valor, writable: true, configurable: true });
  }
  peticion = spyOn(globalThis, "fetch").mockImplementation((async (_url: RequestInfo | URL, _init?: RequestInit) =>
    Response.json(personaje)) as typeof fetch);
  raiz = createRoot(ventana.document.body.appendChild(ventana.document.createElement("div")) as unknown as HTMLElement);
});

afterEach(async () => {
  await act(async () => raiz.unmount());
  peticion.mockRestore();
  for (const [clave, descriptor] of anteriores) {
    if (descriptor) Object.defineProperty(globalThis, clave, descriptor);
    else Reflect.deleteProperty(globalThis, clave);
  }
  anteriores.clear();
  await ventana.happyDOM.close();
});

async function escribir(etiqueta: string, valor: string) {
  const label = [...ventana.document.querySelectorAll("label")].find((l) => l.textContent?.trim() === etiqueta);
  const campo = ventana.document.getElementById(label?.getAttribute("for") ?? "") as unknown as HTMLInputElement;
  expect(campo).not.toBeNull();
  await act(async () => {
    // El setter del prototipo, no el de la instancia: así React ve un valor nuevo, como al teclear.
    let prototipo: object | null = Object.getPrototypeOf(campo);
    while (prototipo && !Object.getOwnPropertyDescriptor(prototipo, "value"))
      prototipo = Object.getPrototypeOf(prototipo);
    const asignar = prototipo ? Object.getOwnPropertyDescriptor(prototipo, "value")?.set : undefined;
    if (!asignar) throw new Error("El campo no tiene setter de valor");
    // React DOM se carga antes de que exista `window`, así que escucha los cambios como en un navegador sin el
    // evento `input`: con el foco puesto y una tecla soltada. Se mandan los dos para no depender de cuál use.
    campo.dispatchEvent(new ventana.FocusEvent("focusin", { bubbles: true }) as unknown as Event);
    asignar.call(campo, valor);
    campo.dispatchEvent(new ventana.Event("input", { bubbles: true }) as unknown as Event);
    campo.dispatchEvent(new ventana.KeyboardEvent("keyup", { bubbles: true }) as unknown as Event);
  });
}

const boton = (texto: string) =>
  [...ventana.document.querySelectorAll("button")].find((b) => b.textContent?.trim() === texto) as unknown as
    | HTMLButtonElement
    | undefined;

const cuerpoEnviado = (): Record<string, unknown> => {
  const [, init] = peticion.mock.calls.at(-1) ?? [];
  return JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as Record<string, unknown>;
};

test("guardar la ficha sin cambiar el estilo no envía el estilo ni su guía", async () => {
  await act(async () =>
    raiz.render(<PanelFicha personaje={personaje} estilosAnimados={ESTILOS} onPersonaje={() => {}} />),
  );
  await escribir("Rasgos físicos", "pecas en la nariz");
  await act(async () => boton("Guardar la ficha")?.click());
  const cuerpo = cuerpoEnviado();
  expect(cuerpo.rasgos).toBe("pecas en la nariz");
  for (const campo of ["estiloAnimado", "guiaPaleta", "guiaTrazo", "guiaDetalle", "guiaReferencias"]) {
    expect(cuerpo).not.toHaveProperty(campo);
  }
});

test("un cambio de estilo de verdad avisa de lo que descarta y no se guarda sin confirmarlo", async () => {
  await act(async () =>
    raiz.render(<PanelFicha personaje={personaje} estilosAnimados={ESTILOS} onPersonaje={() => {}} />),
  );
  await escribir("Paleta", "neón");
  expect(ventana.document.body.textContent).toContain("descarta su cara, sus retratos y sus vistas");
  expect(boton("Guardar la ficha")?.disabled).toBe(true);

  const casilla = [...ventana.document.querySelectorAll("label")]
    .find((l) => l.textContent?.includes("Entiendo que se descartan"))
    ?.querySelector('input[type="checkbox"]') as unknown as HTMLInputElement | undefined;
  expect(casilla).toBeDefined();
  await act(async () => casilla?.click());
  expect(boton("Guardar la ficha")?.disabled).toBe(false);
  await act(async () => boton("Guardar la ficha")?.click());
  const cuerpo = cuerpoEnviado();
  expect(cuerpo.guiaPaleta).toBe("neón");
  expect(cuerpo.confirmarCambioEstilo).toBe(true);
});
