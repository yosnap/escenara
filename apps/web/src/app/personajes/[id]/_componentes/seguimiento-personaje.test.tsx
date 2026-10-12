import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TrabajoVista } from "@/lib/generacion";
import type { PersonajeVista } from "@/lib/personajes";
import { SeguimientoPersonaje } from "./seguimiento-personaje";

let ventana: Window;
let raiz: Root;
let peticion: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
const anteriores = new Map<string, PropertyDescriptor | undefined>();
const trabajo = {
  id: "trabajo-1",
  tipo: "fotograma",
  estado: "en_curso",
  creadoEn: new Date().toISOString(),
  terminadoEn: null,
  medio: null,
  error: null,
  excesoCreditos: null,
} as TrabajoVista;
const terminado = { ...trabajo, estado: "listo", medio: { id: "imagen-1", url: "/hoja.png" } } as TrabajoVista;

beforeEach(() => {
  ventana = new Window({ url: "http://localhost/personajes/p1" });
  for (const [clave, valor] of Object.entries({
    window: ventana,
    document: ventana.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    anteriores.set(clave, Object.getOwnPropertyDescriptor(globalThis, clave));
    Object.defineProperty(globalThis, clave, { value: valor, writable: true, configurable: true });
  }
  peticion = spyOn(globalThis, "fetch").mockImplementation((async (url: RequestInfo | URL) =>
    String(url).includes("/trabajos/")
      ? Response.json(terminado)
      : Response.json({ id: "p1", totalGeneradas: 3 })) as typeof fetch);
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

function FichaDePrueba() {
  const [personaje, setPersonaje] = useState<PersonajeVista | null>(null);
  const [resultado, setResultado] = useState<TrabajoVista | null>(null);
  return (
    <>
      <SeguimientoPersonaje personajeId="p1" trabajo={trabajo} onPersonaje={setPersonaje} onResultado={setResultado} />
      <output>{personaje?.totalGeneradas}</output>
      {/* biome-ignore lint/performance/noImgElement: imagen del arnés de prueba, sin optimización de Next. */}
      {resultado?.medio && <img src={resultado.medio.url} alt="Hoja generada" />}
    </>
  );
}

test("al terminar carga la ficha y muestra la imagen sin navegar ni volver a generar", async () => {
  await act(async () => raiz.render(<FichaDePrueba />));
  expect(ventana.document.querySelector("img")).toBeNull();
  await act(async () => {
    await new Promise((resolver) => setTimeout(resolver, 4300));
  });
  expect(ventana.document.querySelector("output")?.textContent).toBe("3");
  expect(ventana.document.querySelector("img")?.getAttribute("src")).toBe("/hoja.png");
  expect(peticion.mock.calls.map(([url]) => url)).toEqual(["/api/generacion/trabajos/trabajo-1", "/api/personajes/p1"]);
}, 10000);

test("si falla leer la ficha, permite cargar el resultado sin reenviar la generación", async () => {
  peticion.mockImplementation((async (url: RequestInfo | URL) =>
    String(url).includes("/trabajos/")
      ? Response.json(terminado)
      : Response.json({ error: "Sin conexión" }, { status: 503 })) as typeof fetch);
  await act(async () => raiz.render(<FichaDePrueba />));
  await act(async () => {
    await new Promise((resolver) => setTimeout(resolver, 4300));
  });
  expect(ventana.document.body.textContent).toContain("no se ha podido actualizar la ficha");
  peticion.mockResolvedValue(Response.json({ id: "p1", totalGeneradas: 3 }));
  await act(async () => {
    const boton = [...ventana.document.querySelectorAll("button")].find(
      (b) => b.textContent === "Cargar el resultado en la ficha",
    );
    boton?.click();
  });
  expect(ventana.document.querySelector("img")?.getAttribute("src")).toBe("/hoja.png");
  expect(peticion.mock.calls).toHaveLength(3);
}, 10000);
