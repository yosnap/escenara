import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MENSAJE_FALLO_GENERICO, mensajeDeFalloDelProveedor } from "@/lib/causa-fallo";
import { type EstadoCola, ETIQUETA_MOTIVO_FALLO, type TrabajoVista } from "@/lib/generacion";
import { SeguimientoTrabajo } from "../../_componentes/seguimiento-trabajo";
import { ListaTrabajos } from "./lista-trabajos";

/**
 * Un trabajo que el proveedor no completó se explica con su causa en el historial y en el resultado de «Crear»;
 * uno antiguo, sin causa, se sigue viendo con la etiqueta y el mensaje de siempre.
 */
const COLA: EstadoCola = { enCola: 0, enMarcha: 0, workerActivo: true, ultimoLatido: null };

const BLOQUEO = mensajeDeFalloDelProveedor("bloqueo_seguridad", {
  proveedor: "KIE.ai",
  modelo: "Gemini Omni 1.1 Flash (vídeo)",
  creditos: 0,
  conProducto: true,
  conPersonaje: false,
});

function fallido(cambios: Partial<TrabajoVista>): TrabajoVista {
  return {
    id: "8d9c3a52-0000-4000-8000-000000000001",
    tipo: "animacion",
    proveedor: "kie",
    modelo: "google/gemini-omni-flash-1-1",
    estado: "fallido",
    etapa: null,
    estadoProveedor: "fail",
    taskId: "tarea_1",
    escena: "Presenta la crema a cámara.",
    creditosEstimados: 40,
    creditosConsumidos: 0,
    error: MENSAJE_FALLO_GENERICO,
    medioOrigenId: null,
    personajeId: null,
    medio: null,
    trabajoPadreId: null,
    direccion: null,
    derechosConfirmados: true,
    motivoFallo: "contenido",
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
    ...cambios,
  };
}

describe("causa del fallo en pantalla", () => {
  test("el historial muestra la causa del bloqueo, que no se ha cobrado y qué probar", () => {
    const html = renderToStaticMarkup(
      <ListaTrabajos iniciales={[fallido({ causaFallo: "bloqueo_seguridad", error: BLOQUEO })]} cola={COLA} />,
    );
    expect(html).toContain("El filtro de seguridad del proveedor bloqueó la generación.");
    expect(html).toContain("no se ha cobrado nada");
    expect(html).toContain("quitar el producto o usar menos fotos suyas");
    expect(html).not.toContain(ETIQUETA_MOTIVO_FALLO.contenido);
  });

  test("el resultado de «Crear» muestra el mismo mensaje", () => {
    const html = renderToStaticMarkup(
      <SeguimientoTrabajo inicial={fallido({ causaFallo: "bloqueo_seguridad", error: BLOQUEO })} onCambio={() => {}} />,
    );
    expect(html).toContain("El filtro de seguridad de Gemini Omni 1.1 Flash (vídeo), en KIE.ai, bloqueó la generación");
  });

  test("un trabajo antiguo con «contenido» y sin causa se ve como siempre", () => {
    const html = renderToStaticMarkup(<ListaTrabajos iniciales={[fallido({})]} cola={COLA} />);
    expect(html).toContain(`${ETIQUETA_MOTIVO_FALLO.contenido}.`);
    expect(html).toContain(MENSAJE_FALLO_GENERICO);
  });
});
