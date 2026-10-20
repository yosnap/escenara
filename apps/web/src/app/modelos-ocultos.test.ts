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
  "app/proyectos/[id]/_componentes/avanzadas-proyecto.tsx": "dentro-de-avanzadas",
};

const PATRONES: readonly { nombre: string; patron: RegExp }[] = [
  { nombre: "nombreModelo", patron: /\bnombreModelo\b/ },
  { nombre: "nombre de un objeto de modelo", patron: /\b\w*[mM]odelo\w*\??\.nombre\b/ },
  { nombre: "SelectorModelo", patron: /<SelectorModelo\b/ },
  { nombre: "PrecioDeModelo", patron: /<PrecioDeModelo\b/ },
  // Un identificador de modelo como hijo de JSX; `valor={x.modelo}` (una prop) y `${x.modelo}` no cuentan.
  { nombre: "identificador de modelo pintado", patron: /(?<![=$\w])\{\s*[\w?.]+\.modelo\s*\}/ },
  // En una plantilla de texto también se pinta; las firmas y claves (`firma={`…`}`, `claveEstable(`) no se ven.
  {
    nombre: "identificador de modelo en una plantilla",
    patron: /^(?!.*(?:firma=|claveEstable\()).*\$\{[\w?.]+\.modelo\}/,
  },
  { nombre: "lista de modelos pintada", patron: /(?<![=$\w])\{\s*[\w?.]+\.modelos\s*\}/ },
  { nombre: "modelo en uso pintado", patron: /(?:\$\{|(?<![=\w])\{\s*)[\w?.]+\.enUso\s*\}/ },
  { nombre: "nombre de los límites del modelo", patron: /\blimites\??\.nombre\b/ },
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

/**
 * Recorrer el disco entero es lento con la máquina cargada (unidad externa y caché fría): las pruebas que lo hacen
 * llevan su propio tope, más holgado que los 5 s por defecto, para que una carga ajena no se lea como un fallo.
 */
const TOPE_RECORRIDO_MS = 60_000;

const relativa = (ruta: string) => path.relative(RAIZ, ruta).split(path.sep).join("/");

/** `${modelo.nombre}`, `${elegido.nombre}`, `${eleccion.nombreModelo}`… dentro de una plantilla de texto. */
const NOMBRE_DE_MODELO_EN_TEXTO =
  /\$\{\s*[\w?.]*(?:[mM]odelo|elegido|eleccion|actual)\w*\??\.(?:nombre|nombreModelo)\s*\}/;

/**
 * Textos de servidor que sí pueden interpolar el nombre, con su motivo: la cuenta y el admin son zonas permitidas,
 * y las funciones de `lib/` reciben ya la frase que les da quien llama (neutra para el usuario normal).
 */
const TEXTOS_PERMITIDOS: Record<string, string> = {
  "server/mapa/mapa.ts": "etiquetas del mapa de modelos de «Tu cuenta»",
  "lib/modelo-para-trend.ts": "motivoSinDuracion solo se pinta en el selector de las Opciones avanzadas",
  "lib/formatos.ts": "recibe como nombre la frase que decide quien llama",
  "lib/presets.ts": "recibe como nombre la frase que decide quien llama",
};

const TEXTOS_DE_SERVIDOR = [...ficheros(path.join(RAIZ, "server")), ...ficheros(path.join(RAIZ, "lib"))]
  .map(relativa)
  .filter(
    (ruta) =>
      !ruta.startsWith("server/admin/") &&
      !ruta.startsWith("server/comparativas/") &&
      !/catalogo-admin|semilla|sincronizacion/.test(ruta) &&
      !(ruta in TEXTOS_PERMITIDOS),
  );

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

  test(
    "ninguna pantalla de usuario pinta un modelo fuera de las Opciones avanzadas",
    () => {
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
    },
    TOPE_RECORRIDO_MS,
  );

  test("la lista blanca no guarda ficheros que ya no existen ni que no usan las avanzadas", () => {
    for (const [ruta, permiso] of Object.entries(LISTA_BLANCA)) {
      expect(PANTALLAS).toContain(ruta);
      if (permiso === "dentro-de-avanzadas") {
        expect(readFileSync(path.join(RAIZ, ruta), "utf8")).toMatch(/\bOpcionesAvanzadas\b/);
      }
    }
  });

  test(
    "ningún texto del servidor interpola el nombre de un modelo sin pasar por el mecanismo de quien administra",
    () => {
      const fuera: string[] = [];
      for (const ruta of TEXTOS_DE_SERVIDOR) {
        readFileSync(path.join(RAIZ, ruta), "utf8")
          .split("\n")
          .forEach((linea, indice) => {
            const limpia = linea.trim();
            if (limpia.startsWith("//") || limpia.startsWith("*") || limpia.includes("console.")) return;
            if (/\b(esLectorAdmin|modeloEnMensaje|conModelo)\b/.test(linea)) return;
            if (NOMBRE_DE_MODELO_EN_TEXTO.test(linea)) fuera.push(`${ruta}:${indice + 1}`);
          });
      }
      expect(fuera).toEqual([]);
    },
    TOPE_RECORRIDO_MS,
  );

  test("caso negativo: un nombre de modelo nuevo en una pantalla se detecta", () => {
    expect(hallazgos("<p>Coste con {estimacion.nombreModelo}</p>")).toEqual(["1: nombreModelo"]);
    expect(hallazgos("<h3>{modeloClip.nombre}</h3>")).toEqual(["1: nombre de un objeto de modelo"]);
    expect(hallazgos('<SelectorModelo etiqueta="Modelo" />')).toEqual(["1: SelectorModelo"]);
    expect(hallazgos("<PrecioDeModelo modelo={m} />")).toEqual(["1: PrecioDeModelo"]);
    expect(hallazgos('<span className="font-mono">{trabajo.modelo}</span>')).toEqual([
      "1: identificador de modelo pintado",
    ]);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: es el texto de un fichero de pantalla, no una plantilla
    expect(hallazgos("const t = `Generado con ${trabajo.modelo}`;")).toEqual([
      "1: identificador de modelo en una plantilla",
    ]);
    expect(hallazgos("<li>{fila.modelos}</li>")).toEqual(["1: lista de modelos pintada"]);
    expect(hallazgos("<p>{avanzadas.enUso}</p>")).toEqual(["1: modelo en uso pintado"]);
    expect(hallazgos("motivo(limites.nombre)")).toEqual(["1: nombre de los límites del modelo"]);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: es el texto de un fichero de servidor, no una plantilla
    expect(NOMBRE_DE_MODELO_EN_TEXTO.test("throw new Error(`${modelo.nombre} no sirve`)")).toBe(true);
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
