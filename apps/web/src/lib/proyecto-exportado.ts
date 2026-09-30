/**
 * Contrato de `proyecto.json`, el índice del ZIP que se descarga al exportar un proyecto (ADR-0041).
 *
 * Es una **lista blanca**: solo sale lo que está aquí escrito. No hay prompts (son material del servidor, ADR-0022),
 * ni identificadores de tareas del proveedor, ni credenciales, ni cabeceras, ni datos de otra cuenta. La versión del
 * esquema sube cuando cambia algo que un lector del paquete tenga que saber; la reimportación no existe todavía.
 */

export const ESQUEMA_PROYECTO_EXPORTADO = "escenara.proyecto";
export const VERSION_PROYECTO_EXPORTADO = 1;

export const ORIGENES_MEDIO = ["fotograma", "clip", "voz", "cancion", "referencia", "musica", "montaje"] as const;
export type OrigenMedio = (typeof ORIGENES_MEDIO)[number];

export interface MedioExportado {
  /** Ruta dentro del ZIP. Todo medio listado está en el paquete y todo archivo de medios del paquete está aquí. */
  ruta: string;
  origen: OrigenMedio;
  tipo: "imagen" | "video" | "audio";
  mime: string;
  bytes: number;
  sha256: string;
}

export interface EscenaExportada {
  id: string;
  orden: number;
  guion: string;
  accion: string;
  segundosPlanificados: number;
  estado: string;
  aprobadaEn: string | null;
  formatoClip: string;
  direccion: {
    plano: string;
    angulo: string;
    movimientoCamara: string;
    microaccion: string;
    direccionDelDialogo: string;
    instrucciones: string;
  };
  /** Rutas de sus medios dentro del paquete, o `null` si no los tiene. */
  medios: {
    fotograma: string | null;
    clip: string | null;
    voz: string | null;
    cancion: string | null;
    referencia: string | null;
  };
}

export interface ExportacionDeMontajeExportada {
  id: string;
  formato: string;
  ancho: number;
  alto: number;
  segundos: number | null;
  creadaEn: string;
  video: string | null;
  subtitulosSrt: string | null;
  subtitulosVtt: string | null;
}

export interface RevisionExportada {
  escenaId: string;
  tipo: string;
  veredicto: string;
  severidad: string;
  fecha: string;
  comprobaciones: { clave: string; resultado: string; severidad: string }[];
}

export interface ProyectoExportado {
  esquema: typeof ESQUEMA_PROYECTO_EXPORTADO;
  version: typeof VERSION_PROYECTO_EXPORTADO;
  exportadoEn: string;
  aplicacion: { nombre: "Escenara"; version: string };
  proyecto: {
    id: string;
    titulo: string;
    formato: string;
    estado: string;
    idea: string;
    concepto: string;
    acabado: string;
    segundosPorClip: number;
    creadoEn: string;
    actualizadoEn: string;
  };
  escenas: EscenaExportada[];
  montaje: {
    version: number;
    formato: string;
    volumenVoz: number;
    volumenMusica: number;
    subtitulosQuemados: boolean;
    etiquetaVisible: boolean;
  } | null;
  exportacionesDelMontaje: ExportacionDeMontajeExportada[];
  musica: string[];
  revisiones: RevisionExportada[];
  /** Créditos del proyecto: lo reservado al pedir (estimado) y lo que costó de verdad (consumido). */
  gasto: { estimadoCreditos: number; consumidoCreditos: number };
  medios: MedioExportado[];
}

const esTexto = (v: unknown): v is string => typeof v === "string";
const esNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const esFecha = (v: unknown) => esTexto(v) && !Number.isNaN(Date.parse(v));
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const rutaONulo = (v: unknown) => v === null || esTexto(v);

/** Claves exactas de un objeto: una clave de más es un campo que se ha colado fuera de la lista blanca. */
function clavesExactas(objeto: Record<string, unknown>, esperadas: string[], donde: string, errores: string[]): void {
  const sobran = Object.keys(objeto).filter((k) => !esperadas.includes(k));
  const faltan = esperadas.filter((k) => !(k in objeto));
  if (sobran.length > 0) errores.push(`${donde}: campos no permitidos: ${sobran.join(", ")}`);
  if (faltan.length > 0) errores.push(`${donde}: faltan campos: ${faltan.join(", ")}`);
}

/**
 * Valida un `proyecto.json` contra su esquema y comprueba que **todo medio citado está en `medios`**. Devuelve la
 * lista de problemas; vacía, es válido. `archivos`, si se pasa, son las rutas del ZIP: entonces también comprueba
 * que cada medio listado está en el paquete y que no hay medios en el paquete sin listar.
 */
export function validarProyectoExportado(valor: unknown, archivos?: Iterable<string>): string[] {
  const errores: string[] = [];
  if (!esObjeto(valor)) return ["proyecto.json no es un objeto."];
  clavesExactas(
    valor,
    [
      "esquema",
      "version",
      "exportadoEn",
      "aplicacion",
      "proyecto",
      "escenas",
      "montaje",
      "exportacionesDelMontaje",
      "musica",
      "revisiones",
      "gasto",
      "medios",
    ],
    "raíz",
    errores,
  );
  if (valor.esquema !== ESQUEMA_PROYECTO_EXPORTADO) errores.push("esquema: no es el de un proyecto de Escenara.");
  if (valor.version !== VERSION_PROYECTO_EXPORTADO) errores.push(`version: se esperaba ${VERSION_PROYECTO_EXPORTADO}.`);
  if (!esFecha(valor.exportadoEn)) errores.push("exportadoEn: no es una fecha.");

  const p = valor.proyecto;
  if (!esObjeto(p)) errores.push("proyecto: falta.");
  else {
    clavesExactas(
      p,
      [
        "id",
        "titulo",
        "formato",
        "estado",
        "idea",
        "concepto",
        "acabado",
        "segundosPorClip",
        "creadoEn",
        "actualizadoEn",
      ],
      "proyecto",
      errores,
    );
    if (!esTexto(p.titulo)) errores.push("proyecto.titulo: no es texto.");
    if (!esNumero(p.segundosPorClip)) errores.push("proyecto.segundosPorClip: no es un número.");
  }

  const medios = Array.isArray(valor.medios) ? valor.medios : [];
  if (!Array.isArray(valor.medios)) errores.push("medios: no es una lista.");
  const rutas = new Set<string>();
  medios.forEach((m, i) => {
    if (!esObjeto(m)) {
      errores.push(`medios[${i}]: no es un objeto.`);
      return;
    }
    clavesExactas(m, ["ruta", "origen", "tipo", "mime", "bytes", "sha256"], `medios[${i}]`, errores);
    if (!esTexto(m.ruta) || !m.ruta.startsWith("medios/")) errores.push(`medios[${i}].ruta: tiene que ir en medios/.`);
    else if (rutas.has(m.ruta)) errores.push(`medios[${i}].ruta: repetida.`);
    else rutas.add(m.ruta);
    if (!ORIGENES_MEDIO.includes(m.origen as OrigenMedio)) errores.push(`medios[${i}].origen: no válido.`);
    if (!["imagen", "video", "audio"].includes(m.tipo as string)) errores.push(`medios[${i}].tipo: no válido.`);
    if (!esNumero(m.bytes) || m.bytes < 0) errores.push(`medios[${i}].bytes: no válido.`);
    if (!esTexto(m.sha256) || !/^[0-9a-f]{64}$/.test(m.sha256)) errores.push(`medios[${i}].sha256: no válido.`);
  });
  const citado = (ruta: unknown, donde: string) => {
    if (ruta === null) return;
    if (!esTexto(ruta) || !rutas.has(ruta)) errores.push(`${donde}: cita un medio que no está en «medios».`);
  };

  if (!Array.isArray(valor.escenas)) errores.push("escenas: no es una lista.");
  else
    valor.escenas.forEach((e, i) => {
      if (!esObjeto(e)) {
        errores.push(`escenas[${i}]: no es un objeto.`);
        return;
      }
      clavesExactas(
        e,
        [
          "id",
          "orden",
          "guion",
          "accion",
          "segundosPlanificados",
          "estado",
          "aprobadaEn",
          "formatoClip",
          "direccion",
          "medios",
        ],
        `escenas[${i}]`,
        errores,
      );
      if (!esObjeto(e.medios)) errores.push(`escenas[${i}].medios: falta.`);
      else {
        clavesExactas(e.medios, ["fotograma", "clip", "voz", "cancion", "referencia"], `escenas[${i}].medios`, errores);
        for (const [clave, ruta] of Object.entries(e.medios)) {
          if (!rutaONulo(ruta)) errores.push(`escenas[${i}].medios.${clave}: no válido.`);
          else citado(ruta, `escenas[${i}].medios.${clave}`);
        }
      }
      if (!esObjeto(e.direccion)) errores.push(`escenas[${i}].direccion: falta.`);
      else
        clavesExactas(
          e.direccion,
          ["plano", "angulo", "movimientoCamara", "microaccion", "direccionDelDialogo", "instrucciones"],
          `escenas[${i}].direccion`,
          errores,
        );
    });

  if (!Array.isArray(valor.exportacionesDelMontaje)) errores.push("exportacionesDelMontaje: no es una lista.");
  else
    valor.exportacionesDelMontaje.forEach((x, i) => {
      if (!esObjeto(x)) {
        errores.push(`exportacionesDelMontaje[${i}]: no es un objeto.`);
        return;
      }
      clavesExactas(
        x,
        ["id", "formato", "ancho", "alto", "segundos", "creadaEn", "video", "subtitulosSrt", "subtitulosVtt"],
        `exportacionesDelMontaje[${i}]`,
        errores,
      );
      citado(x.video, `exportacionesDelMontaje[${i}].video`);
      for (const clave of ["subtitulosSrt", "subtitulosVtt"] as const) {
        const ruta = x[clave];
        if (ruta !== null && !(esTexto(ruta) && ruta.startsWith("subtitulos/"))) {
          errores.push(`exportacionesDelMontaje[${i}].${clave}: tiene que ir en subtitulos/.`);
        }
      }
    });

  if (!Array.isArray(valor.musica)) errores.push("musica: no es una lista.");
  else for (const [i, ruta] of valor.musica.entries()) citado(ruta, `musica[${i}]`);
  if (!Array.isArray(valor.revisiones)) errores.push("revisiones: no es una lista.");
  if (!esObjeto(valor.gasto) || !esNumero(valor.gasto.estimadoCreditos) || !esNumero(valor.gasto.consumidoCreditos)) {
    errores.push("gasto: faltan las cifras.");
  }
  if (valor.montaje !== null && !esObjeto(valor.montaje)) errores.push("montaje: no válido.");

  if (archivos) {
    const enElPaquete = new Set(archivos);
    for (const ruta of rutas) if (!enElPaquete.has(ruta)) errores.push(`${ruta}: listado pero no está en el paquete.`);
    for (const ruta of enElPaquete) {
      if (ruta.startsWith("medios/") && !rutas.has(ruta)) errores.push(`${ruta}: está en el paquete sin listar.`);
    }
  }
  return errores;
}
