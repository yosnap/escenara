"use client";

import { Download, RefreshCw } from "lucide-react";
import { Boton, claseBoton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { formatearTamano } from "@/lib/media/reglas";
import {
  ETIQUETA_ESTADO_EXPORTACION,
  ETIQUETA_FORMATO_MONTAJE,
  ETIQUETA_POSICION,
  type ExportacionVista,
} from "@/lib/montaje";
import { FORMATOS_SUBTITULOS } from "@/lib/voz";
import { urlSubtitulos } from "./api-montaje";

/**
 * Una exportación terminada: qué salió, si sigue correspondiendo al montaje de ahora y cómo descargarlo.
 *
 * **Vigente u obsoleta** es lo importante de esta tarjeta: el montaje se sigue editando después de exportar, así
 * que un MP4 de una versión anterior no es un error, pero tampoco es lo que se ve en la pantalla, y decirlo evita
 * que alguien publique el vídeo de antes de su último cambio.
 */
export function TarjetaExportacion({
  exportacion,
  versionVigente,
  renovando,
  onRenovar,
}: {
  exportacion: ExportacionVista;
  versionVigente: number;
  renovando?: boolean;
  /** Vuelve a pedir la exportación al servidor. Es lo que **renueva la URL temporal** del MP4. */
  onRenovar: () => void;
}) {
  const fallida = exportacion.estado === "fallido";
  const fecha = new Date(exportacion.creadoEn).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });

  return (
    <article className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold text-texto">
          {ETIQUETA_ESTADO_EXPORTACION[exportacion.estado]}
          <span className="ml-2 font-normal text-sm text-texto-suave">{fecha}</span>
        </h3>
        <p className="text-sm text-texto-suave">
          {exportacion.vigente ? (
            <span className="font-semibold text-correcto">Corresponde al montaje de ahora</span>
          ) : (
            <span className="font-semibold text-aviso">
              De una versión anterior del montaje (la {exportacion.montajeVersion}, y ahora vas por la {versionVigente})
            </span>
          )}
        </p>
      </div>

      {fallida && (
        <Aviso tono="error">
          {exportacion.error ||
            "El montaje no ha terminado y el servidor no ha dejado dicho por qué. Vuelve a pedirlo: si se repite, quien administra esta instalación lo ve en el registro del worker."}
        </Aviso>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <Dato termino="Formato">{ETIQUETA_FORMATO_MONTAJE[exportacion.formato]}</Dato>
        <Dato termino="Duración">{exportacion.duracion === null ? "—" : `${exportacion.duracion} s`}</Dato>
        <Dato termino="Tamaño">{exportacion.tamano === null ? "—" : formatearTamano(exportacion.tamano)}</Dato>
        <Dato termino="Etiqueta de IA">
          {exportacion.etiquetaAplicada ? `Sí, ${ETIQUETA_POSICION[exportacion.etiquetaPosicion].toLowerCase()}` : "No"}
        </Dato>
        <Dato termino="Subtítulos">
          {exportacion.subtitulosQuemados
            ? "Quemados en el vídeo"
            : exportacion.tieneSubtitulos
              ? "Adjuntos, en fichero"
              : "Sin subtítulos"}
        </Dato>
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        {exportacion.medio ? (
          <a href={exportacion.medio.url} download className={claseBoton("primario", "sm")}>
            <Download className="size-4" aria-hidden />
            Descargar el MP4
          </a>
        ) : (
          exportacion.estado === "listo" && (
            <p className="text-sm text-texto">
              El MP4 ya no está en tu biblioteca: lo has borrado o está en la papelera. Vuelve a exportar para tenerlo
              otra vez; no cuesta créditos.
            </p>
          )
        )}
        {exportacion.tieneSubtitulos &&
          FORMATOS_SUBTITULOS.map((formato) => (
            <a key={formato} href={urlSubtitulos(exportacion.id, formato)} className={claseBoton("secundario", "sm")}>
              Subtítulos {formato.toUpperCase()}
            </a>
          ))}
        <Boton
          variante="fantasma"
          tamano="sm"
          icono={<RefreshCw className="size-4" aria-hidden />}
          cargando={renovando}
          onClick={onRenovar}
        >
          Renovar el enlace
        </Boton>
      </div>

      {exportacion.medio && (
        <p className="text-sm text-texto-suave">
          El enlace del MP4 es temporal por seguridad. Si caduca mientras tienes esta pantalla abierta, «Renovar el
          enlace» lo vuelve a pedir: no se monta nada otra vez y no cuesta nada.
        </p>
      )}
    </article>
  );
}

function Dato({ termino, children }: { termino: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-texto-suave">{termino}</dt>
      <dd className="font-medium text-texto">{children}</dd>
    </div>
  );
}
