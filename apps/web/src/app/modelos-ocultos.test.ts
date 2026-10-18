import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * **Guardia de modelos ocultos.** El usuario normal no ve nombres de modelo en ninguna pantalla salvo dentro de las
 * «Opciones avanzadas» de cada vídeo. Cuenta (mapa de modelos y claves), comparar y el panel de administración son
 * zonas permitidas y no se recorren.
 *
 * Recorre `app/` y `components/ui/` buscando lo que pinta un modelo por su nombre: el campo `nombreModelo`, el nombre
 * de un objeto de modelo (`modelo.nombre`, `modeloFoto.nombre`…), el selector y el precio por modelo, y un
 * identificador de modelo pintado como texto (`{trabajo.modelo}`). Un fichero solo puede usarlos si está en la lista
 * blanca **y** usa las Opciones avanzadas, que es donde tienen que ir.
 */

const RAIZ = path.resolve(import.meta.dir, "..");

/** Zonas donde los nombres de modelo son legítimos. */
const EXCLUIDAS = ["app/admin/", "app/cuenta/", "app/comparar/", "components/ui/comparativas/"];

/**
 * Ficheros que pintan modelos **dentro** de `OpcionesAvanzadas` (o `GeneradoCon`). Las definiciones (el propio
 * componente de modelos y el de avanzadas) no necesitan usarlas.
 */
const LISTA_BLANCA: Record<string, "definicion" | "dentro-de-avanzadas"> = {
  "components/ui/modelo.tsx": "definicion",
  "components/ui/opciones-avanzadas.tsx": "definicion",
  "app/crear/_componentes/paso-sujeto.tsx": "dentro-de-avanzadas",
  "app/crear/_componentes/paso-clip.tsx": "dentro-de-avanzadas",
  "app/proyectos/[id]/produccion/_componentes/tarjeta-escena.tsx": "dentro-de-avanzadas",
};

const PATRONES: readonly { nombre: string; patron: RegExp }[] = [
  { nombre: "nombreModelo", patron: /\bnombreModelo\b/ },
  { nombre: "nombre de un objeto de modelo", patron: /\b\w*[mM]odelo\w*\??\.nombre\b/ },
  { nombre: "SelectorModelo", patron: /<SelectorModelo\b/ },
  { nombre: "PrecioDeModelo", patron: /<PrecioDeModelo\b/ },
  // Un identificador de modelo como hijo de JSX; `valor={x.modelo}` (una prop) y `${x.modelo}` no cuentan.
  { nombre: "identificador de modelo pintado", patron: /(?<![=$\w])\{\s*[\w?.]+\.modelo\s*\}/ },
];

/** Lo que encuentra la guardia en un fichero, por línea. Función pura: es la que se prueba con el caso negativo. */
function hallazgos(codigo: string): string[] {
  const encontrados: string[] = [];
  codigo.split("\n").forEach((linea, indice) => {
    const limpia = linea.trim();
    // Los comentarios explican, no pintan.
    if (limpia.startsWith("//") || limpia.startsWith("*") || limpia.startsWith("/*")) return;
    for (const { nombre, patron } of PATRONES) {
      if (patron.test(linea)) encontrados.push(`${indice + 1}: ${nombre}`);
    }
  });
  return encontrados;
}

function ficheros(directorio: string): string[] {
  return readdirSync(directorio).flatMap((entrada) => {
    const ruta = path.join(directorio, entrada);
    if (statSync(ruta).isDirectory()) return ficheros(ruta);
    return /\.(ts|tsx)$/.test(entrada) && !/\.test\.tsx?$/.test(entrada) ? [ruta] : [];
  });
}

const relativa = (ruta: string) => path.relative(RAIZ, ruta).split(path.sep).join("/");

const PANTALLAS = [...ficheros(path.join(RAIZ, "app")), ...ficheros(path.join(RAIZ, "components/ui"))]
  .map(relativa)
  .filter((ruta) => !EXCLUIDAS.some((zona) => ruta.startsWith(zona)));

describe("modelos ocultos en las pantallas de usuario", () => {
  test("recorre de verdad las pantallas de Crear, proyecto, voz, anuncio, personajes e historiales", () => {
    for (const esperada of [
      "app/crear/_componentes/paso-clip.tsx",
      "app/crear/historial/_componentes/lista-trabajos.tsx",
      "app/proyectos/[id]/_componentes/panel-idea.tsx",
      "app/proyectos/[id]/voz/_componentes/vista-voz.tsx",
      "app/proyectos/[id]/_componentes/anuncio/panel-hooks.tsx",
      "app/personajes/[id]/_componentes/dialogo-ficha-ia.tsx",
      "components/ui/coste.tsx",
    ]) {
      expect(PANTALLAS).toContain(esperada);
    }
    expect(PANTALLAS.some((r) => r.startsWith("app/admin/"))).toBe(false);
  });

  test("ninguna pantalla de usuario pinta un modelo fuera de las Opciones avanzadas", () => {
    const fuera: string[] = [];
    for (const ruta of PANTALLAS) {
      const codigo = readFileSync(path.join(RAIZ, ruta), "utf8");
      const encontrados = hallazgos(codigo);
      if (encontrados.length === 0) continue;
      const permiso = LISTA_BLANCA[ruta];
      if (permiso === "definicion") continue;
      if (permiso === "dentro-de-avanzadas" && /\b(OpcionesAvanzadas|GeneradoCon)\b/.test(codigo)) continue;
      fuera.push(...encontrados.map((h) => `${ruta}:${h}`));
    }
    expect(fuera).toEqual([]);
  });

  test("la lista blanca no guarda ficheros que ya no existen ni que no usan las avanzadas", () => {
    for (const [ruta, permiso] of Object.entries(LISTA_BLANCA)) {
      expect(PANTALLAS).toContain(ruta);
      if (permiso === "dentro-de-avanzadas") {
        expect(readFileSync(path.join(RAIZ, ruta), "utf8")).toMatch(/\bOpcionesAvanzadas\b/);
      }
    }
  });

  test("caso negativo: un nombre de modelo nuevo en una pantalla se detecta", () => {
    expect(hallazgos("<p>Coste con {estimacion.nombreModelo}</p>")).toEqual(["1: nombreModelo"]);
    expect(hallazgos("<h3>{modeloClip.nombre}</h3>")).toEqual(["1: nombre de un objeto de modelo"]);
    expect(hallazgos('<SelectorModelo etiqueta="Modelo" />')).toEqual(["1: SelectorModelo"]);
    expect(hallazgos("<PrecioDeModelo modelo={m} />")).toEqual(["1: PrecioDeModelo"]);
    expect(hallazgos('<span className="font-mono">{trabajo.modelo}</span>')).toEqual([
      "1: identificador de modelo pintado",
    ]);
  });

  test("lo que no pinta un modelo no se marca", () => {
    expect(hallazgos("<SelectorModelo2 />")).toEqual([]);
    expect(hallazgos("valor={estimacion.modelo}")).toEqual([]);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: es el texto de un fichero de pantalla, no una plantilla
    expect(hallazgos("firma={`a|${estimacion.modelo}`}")).toEqual([]);
    expect(hallazgos("// {trabajo.modelo} en un comentario")).toEqual([]);
    expect(hallazgos("<p>{personaje.nombre}</p>")).toEqual([]);
  });
});
