import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { type ComponentType, lazy, Suspense } from "react";
import type { DialogoSelectorMediosProps } from "@/components/ui/media/dialogo-selector-medios";
import type { Medio } from "@/lib/media/tipos";
import { DialogoDePrueba, montarPantalla, type PantallaDePrueba } from "@/lib/pantalla-de-prueba";
import type { ProductoVista } from "@/lib/productos";

/**
 * **La primera imagen de un producto**: tras el alta se llega al paso «Su primera imagen» con sus dos maneras a la
 * vista, y en la ficha sin fotos el estado vacío explica las mismas dos. El diálogo del coste (con la elección de
 * vista) y el selector de la biblioteca se sustituyen por unos que dicen con qué se abren.
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
mock.module("./dialogo-vista-generada", () => ({
  DialogoVistaGenerada: (p: { abierto: boolean; descripcion: string; tipo: string }) =>
    p.abierto ? (
      <output data-dialogo-generar data-tipo={p.tipo}>
        {p.descripcion}
      </output>
    ) : null,
}));
const MEDIO = { id: "m1", titulo: "Bote", nombre: "bote.jpg", tipo: "imagen" } as unknown as Medio;
const diferidos = await import("@/components/ui/media/diferidos");
mock.module("@/components/ui/media/diferidos", () => ({
  ...diferidos,
  DialogoSelectorMedios: (p: DialogoSelectorMediosProps) =>
    p.abierto ? (
      <section data-selector-medios>
        <button type="button" onClick={() => p.onConfirmar([MEDIO])}>
          Elegir el bote
        </button>
      </section>
    ) : null,
}));
const { FichaProducto } = await import("./ficha-producto");
const { ListaProductos } = await import("./lista-productos");

const DESCRIPCION = "Bote de crema blanco con tapa dorada y etiqueta rosa.";
const producto = (cambios: Partial<ProductoVista> = {}): ProductoVista => ({
  id: "p1",
  nombre: "Crema Aurora",
  descripcion: DESCRIPCION,
  tipo: "fisico",
  marcaVisible: false,
  referencias: 0,
  fotosVigentes: 0,
  portada: null,
  actualizado: "2026-10-17T00:00:00.000Z",
  fotos: [],
  ...cambios,
});

let pantalla: PantallaDePrueba;
let peticion: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
const enviados: { metodo: string; cuerpo: Record<string, unknown> }[] = [];

beforeEach(() => {
  rutas.length = 0;
  enviados.length = 0;
  pantalla = montarPantalla("http://localhost/productos/p1?primera-imagen=1");
  peticion = spyOn(globalThis, "fetch").mockImplementation((async (_url: RequestInfo | URL, init?: RequestInit) => {
    const cuerpo = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    enviados.push({ metodo: init?.method ?? "GET", cuerpo });
    if (init?.method === "POST") return Response.json(producto({ nombre: String(cuerpo.nombre) }));
    if (init?.method === "PATCH" && typeof cuerpo.descripcion === "string") {
      return Response.json(producto({ descripcion: cuerpo.descripcion }));
    }
    return Response.json(producto());
  }) as typeof fetch);
});

afterEach(async () => {
  peticion.mockRestore();
  await pantalla.desmontar();
});

const paso = () => pantalla.ventana.document.querySelector("[data-paso-primera-imagen]");
const generar = () => pantalla.ventana.document.querySelector("[data-dialogo-generar]");

test("al crear un producto se va a su ficha con el paso de la primera imagen", async () => {
  await pantalla.pintar(<ListaProductos inicial={[]} />);
  await pantalla.pulsar("Crear el primero");
  await pantalla.escribir("Nombre", "Crema Aurora");
  await pantalla.escribir("Descripción corta", DESCRIPCION);
  await pantalla.pulsar("Crear producto");
  expect(enviados.find((e) => e.metodo === "POST")?.cuerpo).toMatchObject({ descripcion: DESCRIPCION });
  expect(rutas).toEqual(["/productos/p1?primera-imagen=1"]);
});

test("recién creado, la ficha abre con «Su primera imagen» y sus dos opciones", async () => {
  await pantalla.pintar(<FichaProducto inicial={producto()} primeraImagen />);
  expect(paso()?.textContent).toContain("Su primera imagen");
  expect(pantalla.botones()).toEqual(
    expect.arrayContaining(["Genera su primera imagen", "Sube tus fotos", "Lo haré después"]),
  );
  expect(pantalla.texto()).not.toContain("Guardar cambios");
});

test("«Genera su primera imagen» abre el diálogo de la vista con la descripción guardada", async () => {
  await pantalla.pintar(<FichaProducto inicial={producto()} primeraImagen />);
  await pantalla.pulsar("Genera su primera imagen");
  expect(generar()?.textContent).toBe(DESCRIPCION);
  expect(generar()?.getAttribute("data-tipo")).toBe("fisico");
});

test("con la descripción corta, el paso deja completarla y generar sin salir", async () => {
  await pantalla.pintar(<FichaProducto inicial={producto({ descripcion: "Bote" })} primeraImagen />);
  expect(paso()?.textContent).toContain("hace falta describirlo un poco más");
  await pantalla.escribir("Descripción para generarla", DESCRIPCION);
  await pantalla.pulsar("Guardar y generar");
  expect(enviados.find((e) => e.metodo === "PATCH")?.cuerpo).toEqual({
    nombre: "Crema Aurora",
    descripcion: DESCRIPCION,
    tipo: "fisico",
    marcaVisible: false,
  });
  expect(generar()?.textContent).toBe(DESCRIPCION);
});

test("«Sube tus fotos» abre la biblioteca, pide el papel y, al añadir, deja en la ficha", async () => {
  await pantalla.pintar(<FichaProducto inicial={producto()} primeraImagen />);
  await pantalla.pulsar("Sube tus fotos");
  await pantalla.pulsar("Elegir el bote");
  expect(pantalla.ventana.document.querySelector('[data-dialogo="¿Qué muestra esta foto?"]')).not.toBeNull();
  await pantalla.pulsar("Añadir la foto");
  expect(enviados.find((e) => e.metodo === "PATCH")?.cuerpo).toMatchObject({ accion: "anadir-fotos" });
  expect(paso()).toBeNull();
});

test("«Lo haré después» deja en la ficha y quita el paso de la dirección", async () => {
  await pantalla.pintar(<FichaProducto inicial={producto()} primeraImagen />);
  await pantalla.pulsar("Lo haré después");
  expect(paso()).toBeNull();
  expect(pantalla.texto()).toContain("Guardar cambios");
  expect(pantalla.ventana.location.search).toBe("");
});

test("en la ficha sin fotos, el estado vacío explica las dos maneras de poner la primera", async () => {
  await pantalla.pintar(<FichaProducto inicial={producto({ descripcion: "" })} />);
  const vacio = pantalla.ventana.document.querySelector("[data-vacio-primera-imagen]");
  expect(vacio?.textContent).toContain("Todavía no tiene ninguna imagen");
  expect(vacio?.textContent).toContain("Sube tus fotos");
  expect(vacio?.querySelector("[data-motivo-sin-generar]")?.textContent).toContain("describe el producto");
  await pantalla.pulsar("Sube tus fotos");
  expect(pantalla.ventana.document.querySelector("[data-selector-medios]")).not.toBeNull();
});
