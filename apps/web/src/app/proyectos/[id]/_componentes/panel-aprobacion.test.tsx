import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EVALUACION_LISTA, REGLAS_VERSION } from "@/lib/controles";
import { PRODUCTO_ELEGIDO_VACIO } from "@/lib/productos";
import { DIRECCION_SIN_ELEGIR, type EscenaVista, type PlanVista, type ProyectoDetalle } from "@/lib/proyectos";
import { PanelAprobacion } from "./panel-aprobacion";

/**
 * La aprobación con cambios sin guardar en «Escenas»: aprobar entonces aprobaría el guion guardado y no el que se ve,
 * así que el botón queda bloqueado con el motivo escrito.
 */
const escena: EscenaVista = {
  id: "e1",
  proyectoId: "p1",
  orden: 1,
  texto: "",
  direccion: DIRECCION_SIN_ELEGIR,
  producto: PRODUCTO_ELEGIDO_VACIO,
  referenciaIdentidad: null,
  accion: "Escena de prueba",
  segundos: 4,
  estado: "borrador",
  aprobadaEn: null,
  motivoInvalidacion: "",
  trabajoId: null,
  fotograma: null,
  estimacion: null,
  afirmaciones: [],
  controles: EVALUACION_LISTA(REGLAS_VERSION),
};
const plan: PlanVista = {
  creditosAsistente: 0,
  totalCreditos: 0,
  totalEuros: 0,
  presupuestoCreditos: 500,
  escenasSinEstimacion: 0,
  afirmacionesPorVerificar: 0,
  afirmacionesBloqueantes: 0,
  comprobado: "2026-09-27",
  margen: 30,
  estadoControl: "listo",
  impedimentos: [],
};
const detalle = { proyecto: { id: "p1" }, escenas: [escena], plan } as unknown as ProyectoDetalle;
const MOTIVO = "Tienes cambios sin guardar en «Escenas» (el orden de las escenas).";

const pintar = (sinGuardar: string | null) =>
  renderToStaticMarkup(
    <PanelAprobacion detalle={detalle} onCambio={() => {}} onError={() => {}} sinGuardar={sinGuardar} />,
  );
const botonAprobar = (html: string) =>
  html.match(/<button[^>]*>(?:(?!<\/button>).)*Aprobar el plan<\/button>/)?.[0] ?? "";

describe("aprobación con cambios sin guardar", () => {
  test("sin cambios pendientes, el plan se puede aprobar", () => {
    const html = pintar(null);
    expect(html).not.toContain("cambios sin guardar");
    expect(botonAprobar(html)).not.toContain('disabled=""');
    expect(botonAprobar(html)).toContain("Aprobar el plan");
  });

  test("con cambios pendientes: aviso con el motivo y botón bloqueado con el motivo escrito", () => {
    const html = pintar(MOTIVO);
    expect(html).toContain(MOTIVO);
    expect(html).toContain("Bloqueado por un requisito");
    const boton = botonAprobar(html);
    expect(boton).toContain('disabled=""');
    const id = boton.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(html).toContain(`id="${id}"`);
    expect(html).toContain("No se puede aprobar: hay cambios sin guardar en «Escenas».");
  });
});
