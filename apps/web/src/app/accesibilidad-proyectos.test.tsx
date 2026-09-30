import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { auditar } from "@/lib/axe-de-prueba";
import type { ModeloElegible } from "@/lib/catalogo";
import { EVALUACION_LISTA, REGLAS_VERSION } from "@/lib/controles";
import type { Deposito, EstadoCola, Estimacion, TrabajoVista } from "@/lib/generacion";
import type { Medio } from "@/lib/media/tipos";
import { MOTIVO_ETIQUETA_OBLIGATORIA, type MontajeVista } from "@/lib/montaje";
import type { CatalogoParaCrear } from "@/lib/presets";
import type { EscenaProduccionVista, ProduccionVista, TrabajoDeEscena } from "@/lib/produccion";
import type { EscenaRevisionVista, RevisionProyectoVista } from "@/lib/revision";

/**
 * **axe sobre el recorrido de un proyecto** (producción, revisión, montaje) y sobre «Crear» y su historial, con datos
 * de ejemplo que cubren los estados con más controles: un fotograma por aprobar, un fallo con su causa, un clip listo
 * para revisar y un montaje con la etiqueta obligatoria. Ninguna pantalla puede tener violaciones serias o críticas.
 */

const navegacion = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...navegacion,
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
  usePathname: () => "/proyectos/p1",
  useSearchParams: () => new URLSearchParams(),
}));

const { VistaProduccion } = await import("./proyectos/[id]/produccion/_componentes/vista-produccion");
const { VistaRevision } = await import("./proyectos/[id]/revision/_componentes/vista-revision");
const { VistaMontaje } = await import("./proyectos/[id]/montaje/_componentes/vista-montaje");
const { ListaTrabajos } = await import("./crear/historial/_componentes/lista-trabajos");
const { VistaCrear } = await import("./crear/_componentes/vista-crear");

/** La página como la sirve el servidor, con la navegación reducida a un landmark para no repetir la cabecera. */
const pagina = (contenido: ReactNode, titulo?: string) =>
  renderToStaticMarkup(
    <>
      <header>
        <nav aria-label="Aplicación">
          <a href="/proyectos">Proyectos</a>
        </nav>
      </header>
      <main id="contenido" tabIndex={-1}>
        {titulo && <h1>{titulo}</h1>}
        {contenido}
      </main>
    </>,
  );

const sinGraves = async (html: string) => expect((await auditar(html)).graves).toEqual([]);

const medio = (id: string, tipo: Medio["tipo"], mime: string): Medio => ({
  id,
  tipo,
  nombre: `${id}.${mime.split("/")[1]}`,
  mime,
  tamano: 1024,
  ancho: 1080,
  alto: 1920,
  duracion: tipo === "video" ? 8 : null,
  titulo: "",
  altEs: tipo === "imagen" ? "Ana sujeta el bote de champú en la playa" : "",
  altEn: "",
  url: `/api/media/${id}`,
  creadoEn: "2026-09-30T10:00:00.000Z",
  actualizadoEn: "2026-09-30T10:00:00.000Z",
  enPapelera: false,
  origen: null,
  documento: false,
  permisos: { editarImagen: true, borrarDefinitivo: true },
});

const trabajo = (cambios: Partial<TrabajoDeEscena> = {}): TrabajoDeEscena => ({
  id: "t1",
  tipo: "fotograma",
  estado: "listo",
  estadoProveedor: null,
  etapa: "listo",
  creditosEstimados: 4,
  creditosConsumidos: 4,
  error: null,
  motivoFallo: null,
  posicionEnCola: null,
  medio: null,
  modelo: "modelo-de-prueba",
  creadoEn: "2026-09-30T10:00:00.000Z",
  enviadoEn: "2026-09-30T10:00:05.000Z",
  terminadoEn: "2026-09-30T10:01:00.000Z",
  ...cambios,
});

const escenaProduccion = (cambios: Partial<EscenaProduccionVista> = {}): EscenaProduccionVista => ({
  id: "e1",
  formatoClip: "ugc_a_camara",
  orden: 1,
  resumen: "Saluda a cámara con el bote en la mano",
  estado: "aprobada",
  segundos: 8,
  controles: EVALUACION_LISTA(REGLAS_VERSION),
  fotograma: null,
  animacion: null,
  fotogramaAprobado: null,
  clip: null,
  creditosEstimados: 40,
  creditosConsumidos: 0,
  reintentosUsados: 0,
  presupuestoReintentos: 2,
  motivoUltimoFallo: "",
  cambiadaDesdeLaGeneracion: false,
  conProducto: true,
  faltaInsertarCaptura: false,
  reparto: null,
  clipsHablados: [],
  versiones: [],
  bibliotecaDeClips: [],
  ...cambios,
});

describe("axe: el recorrido del proyecto", () => {
  test("producción: por empezar, fotograma por aprobar, fallo y clip listo", async () => {
    const fotograma = medio("f1", "imagen", "image/webp");
    const clip = medio("c1", "video", "video/mp4");
    const produccion: ProduccionVista = {
      proyectoId: "p1",
      titulo: "Champú de verano",
      presupuestoCreditos: 400,
      comprometidoCreditos: 60,
      planAprobado: true,
      escenas: [
        escenaProduccion(),
        escenaProduccion({ id: "e2", orden: 2, fotograma: trabajo({ medio: fotograma }) }),
        escenaProduccion({
          id: "e3",
          orden: 3,
          fotograma: trabajo({ estado: "fallido", etapa: "enviado", motivoFallo: "contenido" }),
          motivoUltimoFallo: "El proveedor lo bloqueó por su filtro de seguridad. No se ha cobrado.",
        }),
        escenaProduccion({
          id: "e4",
          orden: 4,
          fotogramaAprobado: fotograma,
          animacion: trabajo({ id: "t4", tipo: "animacion", medio: clip }),
          clip,
        }),
      ],
      modoVoz: "clip",
      precioClipEstimado: false,
      porProducir: 1,
      creditosPorFotograma: 4,
      umbralAvisoCreditos: 500,
      creditosPorClip: 36,
      selloClip: "sello-clip",
      selloFotograma: "sello-fotograma",
      controlesDelModelo: EVALUACION_LISTA(REGLAS_VERSION),
      enVuelo: 0,
      maximoEnVuelo: 3,
      impedimentos: [],
      cuota: { usadoBytes: 10, cuotaBytes: null, versionesSinUsarBytes: 0 },
    };
    await sinGraves(pagina(<VistaProduccion inicial={produccion} />));
  });

  test("revisión: una escena con clip sin revisar y otra sin clip", async () => {
    const escena = (cambios: Partial<EscenaRevisionVista>): EscenaRevisionVista => ({
      id: "e1",
      orden: 1,
      resumen: "Saluda a cámara",
      segundos: 8,
      clip: null,
      fotogramaAprobado: null,
      hojaDePersonaje: null,
      automatica: null,
      humana: null,
      multimodal: null,
      historial: [],
      severidad: "informativa",
      bloquea: false,
      motivoBloqueo: "",
      coherencia: [],
      ...cambios,
    });
    const revision: RevisionProyectoVista = {
      proyectoId: "p1",
      titulo: "Champú de verano",
      escenas: [
        escena({ clip: medio("c1", "video", "video/mp4"), fotogramaAprobado: medio("f1", "imagen", "image/webp") }),
        escena({ id: "e2", orden: 2 }),
      ],
      revisables: 1,
      criticosAbiertos: 0,
      multimodalDisponible: false,
      motivoSinMultimodal: "No hay ningún modelo multimodal elegido en Admin › Ajustes.",
      creditosPorMultimodal: 0,
      selloMultimodal: "",
      umbralAvisoCreditos: 500,
    };
    await sinGraves(pagina(<VistaRevision inicial={revision} />));
  });

  test("montaje con dos escenas y la etiqueta obligatoria", async () => {
    const montaje: MontajeVista = {
      proyectoId: "p1",
      version: 3,
      formatos: ["vertical_9_16", "cuadrado_1_1"],
      encuadres: {},
      segundosMaximos: 300,
      fragmentos: [
        { escenaId: "e1", entrada: 0, salida: 8 },
        { escenaId: "e2", entrada: 1, salida: 6 },
      ],
      volumenVoz: 1,
      volumenMusica: 0.4,
      subtitulosQuemados: false,
      formatoSubtitulos: "srt",
      etiquetaVisible: true,
      etiquetaPosicion: "abajo",
      etiquetaObligatoria: true,
      motivoEtiqueta: MOTIVO_ETIQUETA_OBLIGATORIA,
      duracionTotal: 13,
      escenas: [1, 2].map((orden) => ({
        escenaId: `e${orden}`,
        orden,
        resumen: `Escena ${orden}`,
        duracionClip: 8,
        medioClip: medio(`c${orden}`, "video", "video/mp4"),
        tieneVoz: orden === 1,
        audioDelClipQuitado: false,
        subtitulos: [],
      })),
      controles: EVALUACION_LISTA(REGLAS_VERSION),
      activo: true,
      exportaciones: [],
      actualizadoEn: "2026-09-30T09:00:00.000Z",
    };
    await sinGraves(pagina(<VistaMontaje inicial={montaje} titulo="Champú de verano" />));
  });
});

const COLA: EstadoCola = { enCola: 1, enMarcha: 0, workerActivo: true, ultimoLatido: null };

describe("axe: Crear y su historial", () => {
  test("historial con un trabajo terminado y uno fallido", async () => {
    const base: TrabajoVista = {
      id: "8d9c3a52-0000-4000-8000-000000000001",
      tipo: "fotograma",
      proveedor: "kie",
      modelo: "modelo-de-prueba",
      proporcion: "9:16",
      estado: "listo",
      etapa: "listo",
      estadoProveedor: "success",
      taskId: "tarea_1",
      escena: "Presenta la crema a cámara.",
      creditosEstimados: 4,
      creditosConsumidos: 4,
      error: null,
      medioOrigenId: null,
      personajeId: null,
      medio: medio("f1", "imagen", "image/webp"),
      trabajoPadreId: null,
      direccion: null,
      derechosConfirmados: true,
      motivoFallo: null,
      causaFallo: null,
      intentos: 1,
      intentosMaximos: 3,
      posicionEnCola: null,
      limiteCreditos: null,
      excesoCreditos: null,
      enRevision: false,
      creadoEn: "2026-09-30T10:00:00.000Z",
      enviadoEn: "2026-09-30T10:00:05.000Z",
      ultimaConsulta: "2026-09-30T10:01:00.000Z",
      terminadoEn: "2026-09-30T10:01:00.000Z",
    };
    const fallido: TrabajoVista = {
      ...base,
      id: "8d9c3a52-0000-4000-8000-000000000002",
      tipo: "animacion",
      estado: "fallido",
      medio: null,
      motivoFallo: "contenido",
      error: "El proveedor no ha completado el trabajo.",
      creditosConsumidos: 0,
    };
    await sinGraves(pagina(<ListaTrabajos iniciales={[base, fallido]} cola={COLA} />, "Historial"));
  });

  test("Crear con clave, un personaje y el catálogo de presets", async () => {
    const estimacion = (tipo: "fotograma" | "animacion", creditos: number) =>
      ({
        tipo,
        modelo: "modelo-de-prueba",
        nombreModelo: "Modelo de prueba",
        conVoz: false,
        unidad: tipo === "fotograma" ? "imagen" : "clip",
        creditos,
        euros: creditos * 0.005,
        saldo: 1000,
        alcanza: true,
        superaUmbral: false,
        umbral: 500,
        fuente: "kie",
        comprobado: "2026-09-30",
        precioAntiguo: false,
        sello: `sello-${tipo}`,
        traduccion: null,
        segundos: tipo === "animacion" ? 8 : null,
        duraciones: tipo === "animacion" ? [4, 8] : [],
        sinReferencia: true,
      }) as unknown as Estimacion;
    const modelo = (id: string, creditos: number): ModeloElegible => ({
      modelo: id,
      nombre: `Modelo ${id}`,
      conVoz: false,
      unidad: "clip",
      estado: "validado",
      creditos,
      precioPublicado: false,
      duracionesConCoste: [],
      duraciones: [4, 8],
      maximoReferencias: 3,
    });
    const catalogo: CatalogoParaCrear = {
      presets: [
        {
          id: "p1",
          categoria: "plano",
          nombre: "Primer plano",
          descripcion: "Cara y hombros",
          proporcion: null,
          segundos: null,
          deLaInstalacion: true,
        },
      ],
      incompatibles: {},
      plantillas: [],
      modelo: "modelo-de-prueba",
      limites: { nombre: "Modelo de prueba", proporciones: ["9:16", "1:1"], duraciones: [4, 8], maximoReferencias: 3 },
    };
    const deposito: Deposito = {
      autorizado: 1000,
      reservado: 0,
      retenido: 0,
      trabajosEnRevision: 0,
      llamadasDeTextoColgadas: 0,
      revisionesColgadas: 0,
      consumido: 40,
      disponible: 960,
      topeTrabajo: null,
      consumidoEuros: 0.2,
    };
    await sinGraves(
      pagina(
        <VistaCrear
          pasoPedido={null}
          estimacionFotograma={estimacion("fotograma", 4)}
          estimacionAnimacion={estimacion("animacion", 36)}
          modelosFotograma={[modelo("edicion", 4)]}
          modelosSinImagen={[modelo("texto", 4)]}
          modelosClip={[modelo("video", 36)]}
          deposito={deposito}
          cola={COLA}
          personajes={[
            {
              id: "ana",
              nombre: "Ana",
              tipo: "persona",
              estado: "listo",
              totalReferencias: 4,
              portada: medio("r1", "imagen", "image/webp"),
              versionNumero: 2,
            },
          ]}
          personajeInicial={null}
          contextoInicial={null}
          catalogoFotogramaInicial={catalogo}
          catalogoClipInicial={catalogo}
          controlesIniciales={EVALUACION_LISTA(REGLAS_VERSION)}
        />,
        "Crear",
      ),
    );
  });
});
