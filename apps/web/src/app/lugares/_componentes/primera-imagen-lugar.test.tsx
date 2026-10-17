import { afterAll, afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type { LugarVista } from "@/lib/lugares";
import type { Medio } from "@/lib/media/tipos";
import {
  montarPantalla,
  type PantallaDePrueba,
  sustitucionesDeFicha,
  sustituirModulos,
} from "@/lib/pantalla-de-prueba";
import type { EncargoDeFoto } from "./dialogo-foto-generada";

/**
 * **La primera imagen de un lugar**: tras el alta se llega al paso «Su primera imagen» con sus dos maneras a la vista,
 * y en la ficha sin fotos el estado vacío explica las mismas dos. El diálogo del coste y el selector de la biblioteca
 * se sustituyen por unos que dicen con qué se abren y dejan encargar o cancelar. Las sustituciones se deshacen al
 * terminar el fichero: no llegan a ninguna otra prueba.
 */
const rutas: string[] = [];
const MEDIO = { id: "m1", titulo: "Patio", nombre: "patio.jpg", tipo: "imagen" } as unknown as Medio;
const restaurar = await sustituirModulos({
  ...sustitucionesDeFicha(rutas, MEDIO, "Elegir el patio"),
  [`${import.meta.dir}/dialogo-foto-generada.tsx`]: () => ({
    DialogoFotoGenerada: (p: {
      encargo: EncargoDeFoto | null;
      descripcion: string;
      onCerrar: () => void;
      onEncargado: (mensaje: string) => void;
    }) =>
      p.encargo ? (
        <section data-dialogo-generar>
          <output>{p.descripcion}</output>
          <button type="button" onClick={() => p.onEncargado("Encargado. La imagen aparecerá en el lugar.")}>
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
const { FichaLugar } = (await import(`./ficha-lugar.tsx?${COPIA}`)) as typeof import("./ficha-lugar");
const { ListaLugares } = (await import(`./lista-lugares.tsx?${COPIA}`)) as typeof import("./lista-lugares");

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
const CON_FOTO = lugar({
  tieneMaestra: true,
  referencias: [{ id: "r1", papel: "maestra", generada: false, orden: 0, medio: MEDIO }],
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
    if (init?.method === "PATCH" && cuerpo.accion === "anadir-fotos") return Response.json(CON_FOTO);
    return Response.json(lugar());
  }) as typeof fetch);
});

afterEach(async () => {
  peticion.mockRestore();
  await pantalla.desmontar();
});

const documento = () => pantalla.ventana.document;
const paso = () => documento().querySelector("[data-paso-primera-imagen]");
const generar = () => documento().querySelector("[data-dialogo-generar]");
const selector = () => documento().querySelector("[data-selector-medios]");
const boton = (texto: string) =>
  [...documento().querySelectorAll("button")].find((b) => b.textContent?.trim() === texto) ?? null;
const enfocado = () => documento().activeElement?.textContent?.trim();
const anuncio = () => documento().querySelector("[data-anuncio-paso]")?.textContent ?? "";
const sinParametro = () => pantalla.ventana.history.replaceState(null, "", "/lugares/l1");

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
  await pantalla.pintar(<FichaLugar inicial={lugar()} />);
  expect(paso()?.textContent).toContain("Su primera imagen");
  expect(pantalla.botones()).toEqual(
    expect.arrayContaining(["Genera su primera imagen", "Sube tus fotos", "Lo haré después"]),
  );
  // La ficha entera espera detrás: no se mezclan los datos con el paso.
  expect(pantalla.texto()).not.toContain("Guardar cambios");
});

test("con alguna imagen puesta no se enseña el paso aunque la dirección lo pida", async () => {
  await pantalla.pintar(<FichaLugar inicial={CON_FOTO} />);
  expect(paso()).toBeNull();
});

test("«Genera su primera imagen» abre el diálogo del coste con la descripción guardada", async () => {
  await pantalla.pintar(<FichaLugar inicial={lugar()} />);
  await pantalla.pulsar("Genera su primera imagen");
  expect(generar()?.querySelector("output")?.textContent).toBe(DESCRIPCION);
});

test("encargar desde el paso lo cierra, lleva el foco a las fotos y no invita a pagar otra", async () => {
  await pantalla.pintar(<FichaLugar inicial={lugar()} />);
  await pantalla.pulsar("Genera su primera imagen");
  await pantalla.pulsar("Encargar de prueba");
  expect(paso()).toBeNull();
  expect(enfocado()).toBe("Fotos");
  expect(anuncio()).toContain("Imagen encargada");
  const vacio = documento().querySelector("[data-vacio-primera-imagen]");
  expect(vacio?.querySelector("[data-generandose]")?.textContent).toContain("Generándose su primera imagen");
  expect(boton("Genera su primera imagen")).toBeNull();
});

test("con la descripción corta, el paso deja completarla y generar con el mismo botón", async () => {
  await pantalla.pintar(<FichaLugar inicial={lugar({ descripcion: "Patio" })} />);
  expect(paso()?.textContent).toContain("hace falta describirlo un poco más");
  expect(boton("Genera su primera imagen")).toBeNull();
  const elBoton = boton("Guardar y generar");
  expect(elBoton?.hasAttribute("disabled")).toBe(true);

  await pantalla.escribir("Descripción para generarla", DESCRIPCION);
  await pantalla.pulsar("Guardar y generar");
  expect(enviados.find((e) => e.metodo === "PATCH")?.cuerpo).toEqual({
    nombre: "Patio de la abuela",
    descripcion: DESCRIPCION,
  });
  expect(generar()?.querySelector("output")?.textContent).toBe(DESCRIPCION);
  // El botón que abrió el diálogo sigue montado (ahora «Genera…»): al cancelar, el foco vuelve a él.
  expect(elBoton?.isConnected).toBe(true);
  expect(elBoton?.textContent?.trim()).toBe("Genera su primera imagen");
  await pantalla.pulsar("Cancelar de prueba");
  expect(generar()).toBeNull();
  expect(paso()).not.toBeNull();
  expect(documento().activeElement === elBoton).toBe(true);
});

test("si no se puede guardar la descripción, se ve la causa y no se abre el coste", async () => {
  peticion.mockImplementation((async () =>
    Response.json(
      { error: "La descripción tiene palabras no permitidas." },
      { status: 400 },
    )) as unknown as typeof fetch);
  await pantalla.pintar(<FichaLugar inicial={lugar({ descripcion: "Patio" })} />);
  await pantalla.escribir("Descripción para generarla", DESCRIPCION);
  await pantalla.pulsar("Guardar y generar");
  expect(pantalla.texto()).toContain("La descripción tiene palabras no permitidas.");
  expect(generar()).toBeNull();
  expect(paso()).not.toBeNull();
});

test("mientras se guarda la descripción, el paso no deja volver a pulsar", async () => {
  let responder: (respuesta: Response) => void = () => {};
  peticion.mockImplementation((async (_url: RequestInfo | URL, init?: RequestInit) => {
    enviados.push({ url: "", metodo: init?.method ?? "GET", cuerpo: {} });
    return new Promise<Response>((resolver) => {
      responder = resolver;
    });
  }) as unknown as typeof fetch);
  await pantalla.pintar(<FichaLugar inicial={lugar({ descripcion: "Patio" })} />);
  await pantalla.escribir("Descripción para generarla", DESCRIPCION);
  await pantalla.pulsar("Guardar y generar");
  for (const texto of ["Guardar y generar", "Sube tus fotos", "Lo haré después"]) {
    expect(boton(texto)?.hasAttribute("disabled")).toBe(true);
  }
  (boton("Guardar y generar") as unknown as HTMLButtonElement).click();
  expect(enviados.filter((e) => e.metodo === "PATCH")).toHaveLength(1);
  responder(Response.json(lugar()));
  await pantalla.pintar(<FichaLugar inicial={lugar({ descripcion: "Patio" })} />);
});

test("«Sube tus fotos» abre la biblioteca y, al añadir bien, deja en la ficha con el foco en las fotos", async () => {
  await pantalla.pintar(<FichaLugar inicial={lugar()} />);
  await pantalla.pulsar("Sube tus fotos");
  expect(selector()).not.toBeNull();
  await pantalla.pulsar("Elegir el patio");
  expect(enviados.find((e) => e.metodo === "PATCH")?.cuerpo).toEqual({
    accion: "anadir-fotos",
    fotos: [{ medioId: "m1", papel: "maestra" }],
  });
  expect(paso()).toBeNull();
  expect(enfocado()).toBe("Fotos");
  expect(anuncio()).toContain("Fotos añadidas");
  expect(pantalla.ventana.location.search).toBe("");
});

test("si añadir las fotos falla, se queda en el paso con la causa", async () => {
  peticion.mockImplementation((async () =>
    Response.json({ error: "Un lugar admite 8 fotos como mucho." }, { status: 400 })) as unknown as typeof fetch);
  await pantalla.pintar(<FichaLugar inicial={lugar()} />);
  await pantalla.pulsar("Sube tus fotos");
  await pantalla.pulsar("Elegir el patio");
  expect(paso()).not.toBeNull();
  expect(pantalla.texto()).toContain("Un lugar admite 8 fotos como mucho.");
});

test("«Lo haré después» deja en la ficha, quita el paso de la dirección y lleva el foco a las fotos", async () => {
  await pantalla.pintar(<FichaLugar inicial={lugar()} />);
  await pantalla.pulsar("Lo haré después");
  expect(paso()).toBeNull();
  expect(pantalla.texto()).toContain("Guardar cambios");
  expect(pantalla.ventana.location.search).toBe("");
  expect(enfocado()).toBe("Fotos");
  expect(anuncio()).toContain("Ya estás en la ficha de «Patio de la abuela»");
});

test("al volver con «Atrás» a una ficha guardada de antes, el paso no reaparece", async () => {
  await pantalla.pintar(<FichaLugar inicial={lugar()} />);
  await pantalla.pulsar("Sube tus fotos");
  await pantalla.pulsar("Elegir el patio");
  expect(paso()).toBeNull();
  // «Atrás» puede volver a montar la ficha con lo que pintó el servidor entonces (sin fotos); la dirección ya no
  // lleva el parámetro, que es lo que decide.
  await pantalla.pintar(<FichaLugar key="restaurada" inicial={lugar()} />);
  expect(paso()).toBeNull();
  expect(documento().querySelector("[data-vacio-primera-imagen]")).not.toBeNull();
});

test("en la ficha sin fotos, el estado vacío explica las dos maneras de poner la primera", async () => {
  sinParametro();
  await pantalla.pintar(<FichaLugar inicial={lugar({ descripcion: "Patio" })} />);
  const vacio = documento().querySelector("[data-vacio-primera-imagen]");
  expect(vacio?.textContent).toContain("Todavía no tiene ninguna imagen");
  expect(vacio?.textContent).toContain("Genera su primera imagen");
  expect(vacio?.textContent).toContain("Sube tus fotos");
  // Sin descripción suficiente, el motivo se lee dentro de la opción, no en letra pequeña.
  expect(vacio?.querySelector("[data-motivo-sin-generar]")?.textContent).toContain("describe el lugar");
  await pantalla.pulsar("Sube tus fotos");
  expect(selector()).not.toBeNull();
});

test("en la ficha sin fotos y con descripción, se genera desde el estado vacío", async () => {
  sinParametro();
  await pantalla.pintar(<FichaLugar inicial={lugar()} />);
  await pantalla.pulsar("Genera su primera imagen");
  expect(generar()?.querySelector("output")?.textContent).toBe(DESCRIPCION);
  await pantalla.pulsar("Encargar de prueba");
  expect(documento().querySelector("[data-generandose]")).not.toBeNull();
});
