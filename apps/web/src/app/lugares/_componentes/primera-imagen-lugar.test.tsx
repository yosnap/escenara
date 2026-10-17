import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { type ComponentType, lazy, Suspense } from "react";
import type { DialogoSelectorMediosProps } from "@/components/ui/media/dialogo-selector-medios";
import type { LugarVista } from "@/lib/lugares";
import type { Medio } from "@/lib/media/tipos";
import { DialogoDePrueba, montarPantalla, type PantallaDePrueba } from "@/lib/pantalla-de-prueba";
import type { EncargoDeFoto } from "./dialogo-foto-generada";

/**
 * **La primera imagen de un lugar**: tras el alta se llega al paso «Su primera imagen» con sus dos maneras a la vista,
 * y en la ficha sin fotos el estado vacío explica las mismas dos. El diálogo del coste y el selector de la biblioteca
 * se sustituyen por unos que dicen con qué se abren: lo que se comprueba es que se abren, y con qué descripción.
 */
const rutas: string[] = [];
const navegacion = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...navegacion,
  useRouter: () => ({ push: (ruta: string) => rutas.push(ruta), replace() {}, refresh() {} }),
}));
mock.module("next/dynamic", () => ({
  default: (cargar: () => Promise<ComponentType<Record<string, unknown>>>) => {
    const Perezoso = lazy(async () => ({ default: await cargar() }));
    return (props: Record<string, unknown>) => (
      <Suspense fallback={null}>
        <Perezoso {...props} />
      </Suspense>
    );
  },
}));
const overlay = await import("@/components/ui/overlay");
mock.module("@/components/ui/overlay", () => ({ ...overlay, Dialogo: DialogoDePrueba }));
mock.module("./dialogo-foto-generada", () => ({
  DialogoFotoGenerada: (p: { encargo: EncargoDeFoto | null; descripcion: string }) =>
    p.encargo ? <output data-dialogo-generar>{p.descripcion}</output> : null,
}));
const MEDIO = { id: "m1", titulo: "Patio", nombre: "patio.jpg", tipo: "imagen" } as unknown as Medio;
const diferidos = await import("@/components/ui/media/diferidos");
mock.module("@/components/ui/media/diferidos", () => ({
  ...diferidos,
  DialogoSelectorMedios: (p: DialogoSelectorMediosProps) =>
    p.abierto ? (
      <section data-selector-medios>
        <button type="button" onClick={() => p.onConfirmar([MEDIO])}>
          Elegir el patio
        </button>
      </section>
    ) : null,
}));
const { FichaLugar } = await import("./ficha-lugar");
const { ListaLugares } = await import("./lista-lugares");

const DESCRIPCION = "Patio andaluz con azulejos azules y macetas.";
const lugar = (cambios: Partial<LugarVista> = {}): LugarVista => ({
  id: "l1",
  nombre: "Patio de la abuela",
  descripcion: DESCRIPCION,
  acabado: "realista",
  estilo: "",
  fotos: 0,
  portada: null,
  tieneMaestra: false,
  declarado: false,
  version: 1,
  actualizado: "2026-10-17T00:00:00.000Z",
  referencias: [],
  declaracion: null,
  versiones: [],
  ...cambios,
});

let pantalla: PantallaDePrueba;
let peticion: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
const enviados: { url: string; metodo: string; cuerpo: Record<string, unknown> }[] = [];

beforeEach(() => {
  rutas.length = 0;
  enviados.length = 0;
  pantalla = montarPantalla("http://localhost/lugares/l1?primera-imagen=1");
  peticion = spyOn(globalThis, "fetch").mockImplementation((async (url: RequestInfo | URL, init?: RequestInit) => {
    const cuerpo = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    enviados.push({ url: String(url), metodo: init?.method ?? "GET", cuerpo });
    if (init?.method === "POST") return Response.json(lugar({ nombre: String(cuerpo.nombre) }));
    if (init?.method === "PATCH" && typeof cuerpo.descripcion === "string") {
      return Response.json(lugar({ descripcion: cuerpo.descripcion }));
    }
    return Response.json(lugar());
  }) as typeof fetch);
});

afterEach(async () => {
  peticion.mockRestore();
  await pantalla.desmontar();
});

const paso = () => pantalla.ventana.document.querySelector("[data-paso-primera-imagen]");
const generar = () => pantalla.ventana.document.querySelector("[data-dialogo-generar]");
const selector = () => pantalla.ventana.document.querySelector("[data-selector-medios]");

test("al crear un lugar se va a su ficha con el paso de la primera imagen", async () => {
  await pantalla.pintar(<ListaLugares inicial={[]} />);
  await pantalla.pulsar("Crear el primero");
  await pantalla.escribir("Nombre", "Patio de la abuela");
  await pantalla.escribir("Descripción corta", DESCRIPCION);
  await pantalla.pulsar("Crear lugar");
  expect(enviados.find((e) => e.metodo === "POST")?.cuerpo).toMatchObject({ descripcion: DESCRIPCION });
  expect(rutas).toEqual(["/lugares/l1?primera-imagen=1"]);
});

test("recién creado, la ficha abre con «Su primera imagen» y sus dos opciones", async () => {
  await pantalla.pintar(<FichaLugar inicial={lugar()} primeraImagen />);
  expect(paso()?.textContent).toContain("Su primera imagen");
  expect(pantalla.botones()).toEqual(expect.arrayContaining(["Genera su primera imagen", "Sube tus fotos"]));
  expect(pantalla.botones()).toContain("Lo haré después");
  // La ficha entera espera detrás: no se mezclan los datos con el paso.
  expect(pantalla.texto()).not.toContain("Guardar cambios");
});

test("«Genera su primera imagen» abre el diálogo del coste con la descripción guardada", async () => {
  await pantalla.pintar(<FichaLugar inicial={lugar()} primeraImagen />);
  await pantalla.pulsar("Genera su primera imagen");
  expect(generar()?.textContent).toBe(DESCRIPCION);
});

test("con la descripción corta, el paso lo dice y deja completarla y generar sin salir", async () => {
  await pantalla.pintar(<FichaLugar inicial={lugar({ descripcion: "Patio" })} primeraImagen />);
  expect(paso()?.textContent).toContain("hace falta describirlo un poco más");
  expect(pantalla.botones()).not.toContain("Genera su primera imagen");
  const boton = [...pantalla.ventana.document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === "Guardar y generar",
  );
  expect(boton?.hasAttribute("disabled")).toBe(true);

  await pantalla.escribir("Descripción para generarla", DESCRIPCION);
  await pantalla.pulsar("Guardar y generar");
  expect(enviados.find((e) => e.metodo === "PATCH")?.cuerpo).toEqual({
    nombre: "Patio de la abuela",
    descripcion: DESCRIPCION,
  });
  expect(generar()?.textContent).toBe(DESCRIPCION);
});

test("si no se puede guardar la descripción, se ve la causa y no se abre el coste", async () => {
  peticion.mockImplementation((async () =>
    Response.json(
      { error: "La descripción tiene palabras no permitidas." },
      { status: 400 },
    )) as unknown as typeof fetch);
  await pantalla.pintar(<FichaLugar inicial={lugar({ descripcion: "Patio" })} primeraImagen />);
  await pantalla.escribir("Descripción para generarla", DESCRIPCION);
  await pantalla.pulsar("Guardar y generar");
  expect(pantalla.texto()).toContain("La descripción tiene palabras no permitidas.");
  expect(generar()).toBeNull();
});

test("«Sube tus fotos» abre la biblioteca y, al añadir, deja en la ficha", async () => {
  await pantalla.pintar(<FichaLugar inicial={lugar()} primeraImagen />);
  await pantalla.pulsar("Sube tus fotos");
  expect(selector()).not.toBeNull();
  await pantalla.pulsar("Elegir el patio");
  expect(enviados.find((e) => e.metodo === "PATCH")?.cuerpo).toEqual({
    accion: "anadir-fotos",
    fotos: [{ medioId: "m1", papel: "maestra" }],
  });
  expect(paso()).toBeNull();
});

test("«Lo haré después» deja en la ficha y quita el paso de la dirección", async () => {
  await pantalla.pintar(<FichaLugar inicial={lugar()} primeraImagen />);
  await pantalla.pulsar("Lo haré después");
  expect(paso()).toBeNull();
  expect(pantalla.texto()).toContain("Guardar cambios");
  expect(pantalla.ventana.location.search).toBe("");
});

test("en la ficha sin fotos, el estado vacío explica las dos maneras de poner la primera", async () => {
  await pantalla.pintar(<FichaLugar inicial={lugar({ descripcion: "Patio" })} />);
  const vacio = pantalla.ventana.document.querySelector("[data-vacio-primera-imagen]");
  expect(vacio?.textContent).toContain("Todavía no tiene ninguna imagen");
  expect(vacio?.textContent).toContain("Genera su primera imagen");
  expect(vacio?.textContent).toContain("Sube tus fotos");
  // Sin descripción suficiente, el motivo se lee dentro de la opción, no en letra pequeña.
  expect(vacio?.querySelector("[data-motivo-sin-generar]")?.textContent).toContain("describe el lugar");
  await pantalla.pulsar("Sube tus fotos");
  expect(selector()).not.toBeNull();
});

test("en la ficha sin fotos y con descripción, se genera desde el estado vacío", async () => {
  await pantalla.pintar(<FichaLugar inicial={lugar()} />);
  await pantalla.pulsar("Genera su primera imagen");
  expect(generar()?.textContent).toBe(DESCRIPCION);
});
