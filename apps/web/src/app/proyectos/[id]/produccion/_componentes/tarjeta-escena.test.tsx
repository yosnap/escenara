import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { auditar } from "@/lib/axe-de-prueba";
import { EVALUACION_LISTA, REGLAS_VERSION } from "@/lib/controles";
import type { Medio } from "@/lib/media/tipos";
import type { EscenaProduccionVista, ProduccionVista } from "@/lib/produccion";

/**
 * La tarjeta de una escena con una **comparativa A/B en marcha** y sin clip: dice que la hay, enlaza a ella y no ofrece
 * ninguna acción que encargue otro clip (aprobar, «Otro clip con este fotograma», «Comparar generando»), que el servidor
 * rechazaría. Sin la comparativa, la misma escena sí ofrece comparar.
 */

const navegacion = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...navegacion,
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
  usePathname: () => "/proyectos/p1/produccion",
  useSearchParams: () => new URLSearchParams(),
}));

const { VistaProduccion } = await import("./vista-produccion");

const fotograma: Medio = {
  id: "f1",
  tipo: "imagen",
  nombre: "f1.webp",
  mime: "image/webp",
  tamano: 1000,
  ancho: 720,
  alto: 1280,
  duracion: null,
  titulo: "",
  altEs: "Ana sujeta el bote de champú en la playa",
  altEn: "",
  url: "/api/media/f1",
  creadoEn: "2026-09-30T10:00:00.000Z",
  actualizadoEn: "2026-09-30T10:00:00.000Z",
  enPapelera: false,
  origen: null,
  documento: false,
  permisos: { editarImagen: true, borrarDefinitivo: true },
};

const escena = (cambios: Partial<EscenaProduccionVista>): EscenaProduccionVista => ({
  id: "e1",
  formatoClip: "ugc_a_camara",
  orden: 1,
  resumen: "Saluda a cámara con el bote en la mano",
  estado: "aprobada",
  segundos: 8,
  controles: EVALUACION_LISTA(REGLAS_VERSION),
  fotograma: null,
  animacion: null,
  fotogramaAprobado: fotograma,
  clip: null,
  creditosEstimados: 40,
  creditosConsumidos: 0,
  reintentosUsados: 0,
  presupuestoReintentos: 2,
  motivoUltimoFallo: "",
  cambiadaDesdeLaGeneracion: false,
  conProducto: false,
  faltaInsertarCaptura: false,
  reparto: null,
  clipsHablados: [],
  versiones: [],
  bibliotecaDeClips: [],
  ...cambios,
});

const produccion = (e: EscenaProduccionVista): ProduccionVista => ({
  proyectoId: "p1",
  titulo: "Champú de verano",
  presupuestoCreditos: 400,
  comprometidoCreditos: 60,
  planAprobado: true,
  escenas: [e],
  modoVoz: "clip",
  precioClipEstimado: false,
  porProducir: 0,
  creditosPorFotograma: 4,
  umbralAvisoCreditos: 500,
  creditosPorClip: 36,
  selloClip: "sello-clip",
  selloFotograma: "sello-fotograma",
  controlesDelModelo: EVALUACION_LISTA(REGLAS_VERSION),
  enVuelo: 1,
  maximoEnVuelo: 3,
  impedimentos: [],
  cuota: { usadoBytes: 10, cuotaBytes: null, versionesSinUsarBytes: 0 },
});

const pintar = (e: EscenaProduccionVista) =>
  renderToStaticMarkup(
    <main id="contenido" tabIndex={-1}>
      <h1>Producción</h1>
      <VistaProduccion inicial={produccion(e)} />
    </main>,
  );

describe("tarjeta de escena con una comparativa en marcha", () => {
  test("avisa, enlaza a la comparativa y no ofrece ningún otro clip", async () => {
    const html = pintar(escena({ comparativaEnMarcha: true }));
    expect(html).toContain("Hay una comparativa generándose en esta escena");
    expect(html).toContain('href="/comparar/escena/e1"');
    expect(html).not.toContain("Otro clip con este fotograma");
    expect(html).not.toContain("Comparar generando");
    expect(html).not.toContain("Aprobar");
    expect((await auditar(html)).graves).toEqual([]);
  });

  test("sin comparativa, la misma escena ofrece comparar generando", () => {
    const html = pintar(escena({ comparativaEnMarcha: false }));
    expect(html).not.toContain("Hay una comparativa generándose");
    expect(html).toContain("Comparar generando");
  });
});
