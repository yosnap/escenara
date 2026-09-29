"use client";

import { Clapperboard } from "lucide-react";
import Link from "next/link";
import { Boton } from "@/components/ui/button";
import { AvisoEstado } from "@/components/ui/feedback";
import { DESCRIPCION_ESTADO_CONTROL, ETIQUETA_ESTADO_CONTROL, frenosSinSalida } from "@/lib/controles";
import { ETIQUETA_FORMATO_MONTAJE, type ExportacionVista, type MontajeVista } from "@/lib/montaje";
import { exportacionTerminada } from "./almacen-exportacion";
import { SeguimientoExportacion } from "./seguimiento-exportacion";

/**
 * Panel de exportación: qué va a salir, qué lo frena y el botón de montarlo.
 *
 * **No cuesta créditos** y se dice donde se lee: el render corre con FFmpeg en esta máquina y no llama a ningún
 * proveedor. Por eso aquí no hay diálogo de coste, ni casilla de «sé que esto gasta», ni sello de precio.
 *
 * La comprobación previa la evalúa el servidor con el motor de controles (el mismo que cierra la puerta del
 * render), así que este panel **no puede decir que se puede exportar** cuando el servidor lo va a rechazar.
 */
export function PanelExportacion({
  montaje,
  exportando,
  sinGuardar,
  onExportar,
  onExportacionCambiada,
}: {
  montaje: MontajeVista;
  exportando?: boolean;
  /** Hay cambios sin guardar: lo que saldría es el montaje guardado, no lo que se ve. */
  sinGuardar?: boolean;
  onExportar: () => void;
  onExportacionCambiada?: (exportacion: ExportacionVista) => void;
}) {
  const frenos = frenosSinSalida(montaje.controles);
  const puede = montaje.activo && frenos.length === 0 && !sinGuardar;
  const enMarcha = montaje.exportaciones.find((e) => !exportacionTerminada(e.estado)) ?? null;
  const anteriores = montaje.exportaciones.filter((e) => e.id !== enMarcha?.id);
  const subtitulos = montaje.escenas.some((e) => e.subtitulos.some((s) => s.texto.trim() !== ""));

  return (
    <section
      aria-labelledby="exportacion"
      className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-4"
    >
      <div>
        <h2 id="exportacion" className="text-2xl font-bold text-texto">
          Exportar el vídeo
        </h2>
        <p className="mt-1 text-texto-suave">
          Se monta con FFmpeg en esta misma máquina. <strong className="text-texto">No cuesta créditos</strong>: no se
          llama a ningún proveedor y no se gasta nada de tu cuenta.
        </p>
      </div>

      {/* Resumen de lo que va a salir. Zona de claridad: datos, sin adornos. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-tarjeta border-2 border-borde bg-elevada p-3 text-sm sm:grid-cols-4">
        <Dato termino="Duración">
          <span className="font-mono">{montaje.duracionTotal} s</span>
        </Dato>
        <Dato termino="Formato">{ETIQUETA_FORMATO_MONTAJE[montaje.formato]}</Dato>
        <Dato termino="Etiqueta de IA">
          {montaje.etiquetaVisible
            ? montaje.etiquetaObligatoria
              ? "Sí, obligatoria"
              : "Sí"
            : "No: la has desactivado"}
        </Dato>
        <Dato termino="Subtítulos">
          {!subtitulos
            ? "Ninguno editado"
            : montaje.subtitulosQuemados
              ? "Quemados y adjuntos"
              : `Adjuntos en ${montaje.formatoSubtitulos.toUpperCase()}`}
        </Dato>
      </dl>

      {/* Comprobación previa. Siempre visible: «listo» también se dice, para que nadie tenga que suponerlo. */}
      <div className="flex flex-col gap-3">
        <h3 className="font-bold text-texto">Antes de montar</h3>
        <AvisoEstado estado={montaje.controles.estado} motivo={DESCRIPCION_ESTADO_CONTROL[montaje.controles.estado]} />
        {montaje.controles.comprobaciones.length > 0 && (
          <ul className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde p-4">
            {montaje.controles.comprobaciones.map((c) => (
              <li
                key={c.regla}
                className="flex flex-col gap-1 border-borde border-t-2 pt-3 first:border-t-0 first:pt-0"
              >
                <p className="text-sm font-bold text-texto-suave">{ETIQUETA_ESTADO_CONTROL[c.estado]}</p>
                <p className="text-texto">{c.motivo}</p>
                <p className="text-texto-suave">{c.accion}</p>
                {c.enlace !== null && (
                  <Link href={c.enlace} className="self-start font-semibold text-acento text-sm hover:underline">
                    Ir a arreglarlo
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-texto-suave">
          Comprobado con las reglas <span className="font-mono">{montaje.controles.reglasVersion}</span>. Estas
          comprobaciones son gratis, igual que el montaje.
        </p>
      </div>

      {sinGuardar && (
        <AvisoEstado
          estado="ajustes"
          motivo="Tienes cambios sin guardar. Lo que se exportaría es el montaje guardado, no lo que ves ahora: guarda antes de montar."
        />
      )}

      <Boton
        variante="chispa"
        className="self-start"
        icono={<Clapperboard className="size-5" aria-hidden />}
        disabled={!puede || enMarcha !== null}
        cargando={exportando}
        onClick={onExportar}
      >
        {enMarcha ? "Ya se está montando" : "Montar y exportar el MP4"}
      </Boton>

      {enMarcha && (
        <SeguimientoExportacion
          key={enMarcha.id}
          inicial={enMarcha}
          versionVigente={montaje.version}
          onCambio={onExportacionCambiada}
        />
      )}

      {anteriores.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="font-bold text-texto">
            {enMarcha ? "Exportaciones anteriores" : "Exportaciones de este proyecto"}
          </h3>
          <p className="text-sm text-texto-suave">
            Pedir dos veces el mismo montaje no crea dos ficheros: el servidor devuelve el que ya salió de esa versión.
          </p>
          {/* El mismo componente que la que está en marcha: una terminada no se sondea, pero sí sabe renovar su
              enlace de descarga, que es lo único que le hace falta a una exportación de hace un rato. */}
          {anteriores.map((exportacion) => (
            <SeguimientoExportacion key={exportacion.id} inicial={exportacion} versionVigente={montaje.version} />
          ))}
        </div>
      )}
    </section>
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
