import { afterAll, afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { act } from "react";
import type { Medio } from "@/lib/media/tipos";
import {
  montarPantalla,
  type PantallaDePrueba,
  sustitucionesDeFicha,
  sustituirModulos,
} from "@/lib/pantalla-de-prueba";
import type { ProductoVista } from "@/lib/productos";

/**
 * **La primera imagen de un producto**: tras el alta se llega al paso «Su primera imagen» con sus dos maneras a la
 * vista, y en la ficha sin fotos el estado vacío explica las mismas dos. El diálogo del coste (con la elección de
 * vista) y el selector de la biblioteca se sustituyen por unos que dicen con qué se abren y dejan encargar o
 * cancelar. Las sustituciones se deshacen al terminar el fichero.
 */
const rutas: string[] = [];
const MEDIO = { id: "m1", titulo: "Bote", nombre: "bote.jpg", tipo: "imagen" } as unknown as Medio;
const restaurar = await sustituirModulos({
  ...sustitucionesDeFicha(rutas, MEDIO, "Elegir el bote"),
  [`${import.meta.dir}/dialogo-vista-generada.tsx`]: () => ({
    DialogoVistaGenerada: (p: {
      abierto: boolean;
      descripcion: string;
      tipo: string;
      onCerrar: () => void;
      onEncargado: (mensaje: string) => void;
    }) =>
      p.abierto ? (
        <section data-dialogo-generar data-tipo={p.tipo}>
          <output>{p.descripcion}</output>
          <button type="button" onClick={() => p.onEncargado("Encargado. La vista aparecerá en el producto.")}>
            Encargar de prueba
          </button>
          <button type="button" onClick={p.onCerrar}>
            Cancelar de prueba
          </button>
        </section>
      ) : null,
  }),
});
afterAll(restaurar);
/**
 * Copias propias de la ficha y de la lista, cargadas después de las sustituciones. Sin `--isolate`, otro fichero puede
 * haberlas cargado antes con el `next/dynamic` de verdad, y la ficha guarda el diálogo diferido al cargarse.
 */
const COPIA = "pantalla-de-prueba";
const { FichaProducto } = (await import(`./ficha-producto.tsx?${COPIA}`)) as typeof import("./ficha-producto");
const { ListaProductos } = (await import(`./lista-productos.tsx?${COPIA}`)) as typeof import("./lista-productos");

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
const CON_FOTO = producto({
  referencias: 1,
  fotosVigentes: 1,
  fotos: [{ id: "r1", papel: "envase", orden: 0, medio: MEDIO, generada: false }],
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
    if (init?.method === "PATCH" && cuerpo.accion === "anadir-fotos") return Response.json(CON_FOTO);
    return Response.json(producto());
  }) as typeof fetch);
});

afterEach(async () => {
  peticion.mockRestore();
  await pantalla.desmontar();
});

const documento = () => pantalla.ventana.document;
const paso = () => documento().querySelector("[data-paso-primera-imagen]");
const generar = () => documento().querySelector("[data-dialogo-generar]");
const boton = (texto: string) =>
  [...documento().querySelectorAll("button")].find((b) => b.textContent?.trim() === texto) ?? null;
const enfocado = () => documento().activeElement?.textContent?.trim();
const anuncio = () => documento().querySelector("[data-anuncio-paso]")?.textContent ?? "";

test("al crear un producto se va a su ficha con el paso de la primera imagen", async () => {
  await pantalla.pintar(<ListaProductos inicial={[]} />);
  await pantalla.pulsar("Crear el primero");
  await pantalla.escribir("Nombre", "Crema Aurora");
  await pantalla.escribir("Descripción corta", DESCRIPCION);
  // Sin responder si se ve una marca no se puede crear: el botón no envía nada.
  await pantalla.pulsar("Crear producto");
  expect(enviados.find((e) => e.metodo === "POST")).toBeUndefined();
  const no = [...documento().querySelectorAll("label")]
    .find((l) => l.textContent?.includes("No, no se ve ninguna"))
    ?.querySelector('[role="radio"]');
  expect(no, "no hay opción «No» en la pregunta de la marca").toBeTruthy();
  await act(async () => (no as unknown as HTMLElement).click());
  await pantalla.pulsar("Crear producto");
  expect(enviados.find((e) => e.metodo === "POST")?.cuerpo).toMatchObject({
    descripcion: DESCRIPCION,
    marcaVisible: false,
  });
  expect(rutas).toEqual(["/productos/p1?primera-imagen=1"]);
});

test("recién creado, la ficha abre con «Su primera imagen» y sus dos opciones", async () => {
  await pantalla.pintar(<FichaProducto inicial={producto()} />);
  expect(paso()?.textContent).toContain("Su primera imagen");
  expect(pantalla.botones()).toEqual(
    expect.arrayContaining(["Genera su primera imagen", "Sube tus fotos", "Lo haré después"]),
  );
  expect(pantalla.texto()).not.toContain("Guardar cambios");
});

test("«Genera su primera imagen» abre el diálogo de la vista con la descripción guardada", async () => {
  await pantalla.pintar(<FichaProducto inicial={producto()} />);
  await pantalla.pulsar("Genera su primera imagen");
  expect(generar()?.querySelector("output")?.textContent).toBe(DESCRIPCION);
  expect(generar()?.getAttribute("data-tipo")).toBe("fisico");
});

test("encargar desde el paso lo cierra, lleva el foco a las fotos y no invita a pagar otra", async () => {
  await pantalla.pintar(<FichaProducto inicial={producto()} />);
  await pantalla.pulsar("Genera su primera imagen");
  await pantalla.pulsar("Encargar de prueba");
  expect(paso()).toBeNull();
  expect(enfocado()).toBe("Fotos de referencia");
  expect(anuncio()).toContain("Imagen encargada");
  expect(documento().querySelector("[data-generandose]")?.textContent).toContain("Generándose su primera imagen");
  // Mientras llega, el estado vacío ya no dice que no tiene ninguna imagen.
  const titulo = documento().querySelector("[data-vacio-primera-imagen] h3")?.textContent;
  expect(titulo).toBe("Su primera imagen se está generando");
  expect(boton("Genera su primera imagen")).toBeNull();
});

test("con la descripción corta, el paso deja completarla y generar con el mismo botón", async () => {
  await pantalla.pintar(<FichaProducto inicial={producto({ descripcion: "Bote" })} />);
  expect(paso()?.textContent).toContain("hace falta describirlo un poco más");
  const elBoton = boton("Guardar y generar");
  await pantalla.escribir("Descripción para generarla", DESCRIPCION);
  await pantalla.pulsar("Guardar y generar");
  expect(enviados.find((e) => e.metodo === "PATCH")?.cuerpo).toEqual({
    nombre: "Crema Aurora",
    descripcion: DESCRIPCION,
    tipo: "fisico",
    marcaVisible: false,
  });
  expect(generar()?.querySelector("output")?.textContent).toBe(DESCRIPCION);
  await pantalla.pulsar("Cancelar de prueba");
  expect(documento().activeElement === elBoton).toBe(true);
  expect(elBoton?.textContent?.trim()).toBe("Genera su primera imagen");
});

test("si no se puede guardar la descripción, se ve la causa y no se abre el coste", async () => {
  peticion.mockImplementation((async () =>
    Response.json(
      { error: "La descripción no puede nombrar una marca ajena." },
      { status: 400 },
    )) as unknown as typeof fetch);
  await pantalla.pintar(<FichaProducto inicial={producto({ descripcion: "Bote" })} />);
  await pantalla.escribir("Descripción para generarla", DESCRIPCION);
  await pantalla.pulsar("Guardar y generar");
  expect(pantalla.texto()).toContain("La descripción no puede nombrar una marca ajena.");
  expect(generar()).toBeNull();
  expect(paso()).not.toBeNull();
});

test("mientras se guarda la descripción, el paso no deja volver a pulsar", async () => {
  let responder: (respuesta: Response) => void = () => {};
  peticion.mockImplementation((async (_url: RequestInfo | URL, init?: RequestInit) => {
    enviados.push({ metodo: init?.method ?? "GET", cuerpo: {} });
    return new Promise<Response>((resolver) => {
      responder = resolver;
    });
  }) as unknown as typeof fetch);
  await pantalla.pintar(<FichaProducto inicial={producto({ descripcion: "Bote" })} />);
  await pantalla.escribir("Descripción para generarla", DESCRIPCION);
  await pantalla.pulsar("Guardar y generar");
  for (const texto of ["Guardar y generar", "Sube tus fotos", "Lo haré después"]) {
    expect(boton(texto)?.hasAttribute("disabled")).toBe(true);
  }
  (boton("Guardar y generar") as unknown as HTMLButtonElement).click();
  expect(enviados.filter((e) => e.metodo === "PATCH")).toHaveLength(1);
  responder(Response.json(producto()));
  await pantalla.pintar(<FichaProducto inicial={producto({ descripcion: "Bote" })} />);
});

test("«Sube tus fotos» abre la biblioteca, pide el papel y, al añadir, deja en la ficha con el foco en las fotos", async () => {
  await pantalla.pintar(<FichaProducto inicial={producto()} />);
  await pantalla.pulsar("Sube tus fotos");
  await pantalla.pulsar("Elegir el bote");
  expect(documento().querySelector('[data-dialogo="¿Qué muestra esta foto?"]')).not.toBeNull();
  await pantalla.pulsar("Añadir la foto");
  expect(enviados.find((e) => e.metodo === "PATCH")?.cuerpo).toMatchObject({ accion: "anadir-fotos" });
  expect(paso()).toBeNull();
  expect(enfocado()).toBe("Fotos de referencia");
  expect(anuncio()).toContain("Fotos añadidas");
});

test("«Lo haré después» deja en la ficha, quita el paso de la dirección y lleva el foco a las fotos", async () => {
  await pantalla.pintar(<FichaProducto inicial={producto()} />);
  await pantalla.pulsar("Lo haré después");
  expect(paso()).toBeNull();
  expect(pantalla.texto()).toContain("Guardar cambios");
  expect(pantalla.ventana.location.search).toBe("");
  expect(enfocado()).toBe("Fotos de referencia");
  expect(anuncio()).toContain("Ya estás en la ficha de «Crema Aurora»");
});

test("al volver con «Atrás» a una ficha guardada de antes, el paso no reaparece", async () => {
  await pantalla.pintar(<FichaProducto inicial={producto()} />);
  await pantalla.pulsar("Lo haré después");
  await pantalla.pintar(<FichaProducto key="restaurada" inicial={producto()} />);
  expect(paso()).toBeNull();
});

test("en la ficha sin fotos, el estado vacío explica las dos maneras de poner la primera", async () => {
  pantalla.ventana.history.replaceState(null, "", "/productos/p1");
  await pantalla.pintar(<FichaProducto inicial={producto({ descripcion: "" })} />);
  const vacio = documento().querySelector("[data-vacio-primera-imagen]");
  expect(vacio?.textContent).toContain("Todavía no tiene ninguna imagen");
  expect(vacio?.textContent).toContain("Sube tus fotos");
  expect(vacio?.querySelector("[data-motivo-sin-generar]")?.textContent).toContain("describe el producto");
  await pantalla.pulsar("Sube tus fotos");
  expect(documento().querySelector("[data-selector-medios]")).not.toBeNull();
});
