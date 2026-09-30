"use client";

import { Download, FileArchive } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Boton, claseBoton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { fechaYHora } from "@/lib/fechas";
import { listarExportaciones, pedirExportacion, type VistaExportacionProyecto } from "./api-datos";

/**
 * «Exportar proyecto»: pide el ZIP, enseña cómo va mientras el worker lo prepara (consulta cada pocos segundos, sin
 * inventarse un porcentaje) y, cuando está listo, el enlace de descarga con su caducidad. Un fallo se dice con su causa.
 */

const EN_MARCHA = ["en_cola", "preparando"];
const MS_CONSULTA = 3000;

const megas = (bytes: number | null) =>
  bytes === null ? "" : `${(bytes / (1024 * 1024)).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB`;

export function ExportarProyecto({
  proyectoId,
  inicial = null,
  compacto = false,
}: {
  proyectoId: string;
  inicial?: VistaExportacionProyecto | null;
  /** Sin textos de ayuda: para la lista de proyectos del diálogo de borrar la cuenta. */
  compacto?: boolean;
}) {
  const [ultima, setUltima] = useState<VistaExportacionProyecto | null>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  const enMarcha = ultima !== null && EN_MARCHA.includes(ultima.estado);

  const consultar = useCallback(async () => {
    const r = await listarExportaciones(proyectoId);
    if (r.ok) setUltima(r.datos.exportaciones[0] ?? null);
    else setError(r.error);
  }, [proyectoId]);

  useEffect(() => {
    if (!enMarcha) return;
    const temporizador = setInterval(consultar, MS_CONSULTA);
    return () => clearInterval(temporizador);
  }, [enMarcha, consultar]);

  const exportar = async () => {
    setPidiendo(true);
    setError(null);
    const r = await pedirExportacion(proyectoId);
    setPidiendo(false);
    if (r.ok) setUltima(r.datos.exportacion);
    else setError(r.error);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Boton
          variante="secundario"
          tamano="sm"
          icono={<FileArchive className="size-4" />}
          cargando={pidiendo || enMarcha}
          onClick={exportar}
        >
          {enMarcha ? "Preparando el ZIP…" : "Exportar proyecto"}
        </Boton>
        {ultima?.estado === "lista" && ultima.descarga && (
          <a href={ultima.descarga} className={claseBoton("chispa", "sm")}>
            <Download className="size-4" aria-hidden /> Descargar ZIP {megas(ultima.bytes)}
          </a>
        )}
      </div>
      <div aria-live="polite" className="text-sm text-texto-suave">
        {ultima?.estado === "en_cola" && "En cola: el worker lo prepara en cuanto quede libre."}
        {ultima?.estado === "preparando" && "Juntando fotogramas, clips, voces y montajes en el paquete…"}
        {ultima?.estado === "lista" && ultima.caducaEn && (
          <>
            Listo con {ultima.medios} {ultima.medios === 1 ? "archivo" : "archivos"}. La descarga caduca el{" "}
            {fechaYHora(ultima.caducaEn)}; después se borra.
          </>
        )}
        {ultima?.estado === "caducada" && "El último paquete ha caducado. Vuelve a exportar para descargarlo."}
        {!compacto &&
          !ultima &&
          "Un ZIP con proyecto.json, los medios en carpetas y un LEEME. Sin claves ni credenciales."}
      </div>
      {ultima?.estado === "fallida" && ultima.error && <Aviso tono="error">{ultima.error}</Aviso>}
      {error && <Aviso tono="error">{error}</Aviso>}
    </div>
  );
}
