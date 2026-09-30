"use client";

import { Database } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { fechaYHora } from "@/lib/fechas";
import type { Ajustes } from "@/server/ajustes";
import type { AjustesDatos } from "@/server/ajustes-datos";
import type { EstadoTusDatos } from "@/server/datos/estado-admin";
import { reintentarArchivosFallidos } from "./acciones-datos";
import { Seccion } from "./seccion-ajustes";

/**
 * **Tus datos**: el periodo de gracia del borrado de cuentas y los límites de la exportación de proyectos. Nada de
 * esto cuesta créditos: la exportación la prepara el worker con el almacenamiento de la instalación.
 */

const CAMPOS: { clave: keyof AjustesDatos; etiqueta: string; ayuda: string; min: number; max: number }[] = [
  {
    clave: "borradoCuentaDiasGracia",
    etiqueta: "Días de gracia al borrar una cuenta",
    ayuda:
      "Mientras dura, la cuenta está desactivada y su dueño puede cancelar el borrado. Pasado el plazo, el worker lo borra todo.",
    min: 1,
    max: 60,
  },
  {
    clave: "borradoCuentaDiasEsperaDesconocidos",
    etiqueta: "Días de espera a un trabajo sin respuesta al borrar una cuenta",
    ayuda:
      "Pasada la gracia, un trabajo «sin respuesta del proveedor» retiene el borrado estos días. Después se consulta una última vez y, si sigue sin respuesta, se apunta su coste estimado como no confirmado (el proveedor pudo cobrarlo) y el borrado sigue.",
    min: 0,
    max: 30,
  },
  {
    clave: "exportacionTamanoMaximoMb",
    etiqueta: "Tamaño máximo de un ZIP de proyecto (MB)",
    ayuda: "Por encima, la exportación se rechaza diciendo cuánto ocupaba. Nunca más de 4000 MB.",
    min: 10,
    max: 4000,
  },
  {
    clave: "exportacionCaducidadHoras",
    etiqueta: "Horas que dura la descarga de un ZIP",
    ayuda: "Después, el worker borra el paquete del almacenamiento y hay que volver a exportar.",
    min: 1,
    max: 168,
  },
  {
    clave: "exportacionMaximoDiario",
    etiqueta: "Exportaciones por cuenta en 24 horas",
    ayuda: "Frena que alguien llene el disco del worker pidiendo paquetes sin parar.",
    min: 1,
    max: 100,
  },
];

export function SeccionDatos({
  valores,
  errorDe,
  onCambio,
  estado,
}: {
  valores: Ajustes;
  errorDe: (campo: keyof Ajustes) => string | undefined;
  onCambio: <K extends keyof Ajustes>(clave: K, valor: Ajustes[K]) => void;
  estado: EstadoTusDatos;
}) {
  return (
    <Seccion
      titulo="Tus datos"
      descripcion="Exportar proyectos y borrar cuentas: plazos y límites. No cuesta créditos."
      icono={<Database />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {CAMPOS.map((c) => (
          <Campo key={c.clave} etiqueta={c.etiqueta} ayuda={c.ayuda} error={errorDe(c.clave)}>
            {(p) => (
              <EntradaTexto
                {...p}
                type="number"
                min={c.min}
                max={c.max}
                step={1}
                inputMode="numeric"
                value={Number.isNaN(valores[c.clave]) ? "" : valores[c.clave]}
                onChange={(e) => onCambio(c.clave, e.target.value === "" ? Number.NaN : Number(e.target.value))}
              />
            )}
          </Campo>
        ))}
      </div>
      <EstadoDeTusDatos estado={estado} />
    </Seccion>
  );
}

function ReintentarFallidos() {
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Boton
        variante="secundario"
        tamano="sm"
        cargando={enviando}
        onClick={async () => {
          setEnviando(true);
          setError(null);
          try {
            setHecho((await reintentarArchivosFallidos()).reintentados);
          } catch (fallo) {
            setHecho(null);
            setError(
              `No se han podido volver a poner en cola: ${fallo instanceof Error ? fallo.message : String(fallo)}. Comprueba que sigues con la sesión abierta y que la base de datos responde, y vuelve a intentarlo.`,
            );
          } finally {
            setEnviando(false);
          }
        }}
      >
        Reintentar los archivos fallidos
      </Boton>
      {error && <Aviso tono="error">{error}</Aviso>}
      {hecho !== null && (
        <Aviso tono="correcto">
          {hecho} {hecho === 1 ? "archivo vuelve" : "archivos vuelven"} a la cola: el worker los intenta en la próxima
          pasada.
        </Aviso>
      )}
    </div>
  );
}

/** Lo que no puede quedarse atascado en silencio: objetos por borrar y borrados de cuenta aplazados. */
function EstadoDeTusDatos({ estado }: { estado: EstadoTusDatos }) {
  const limpio =
    estado.objetosPendientes === 0 &&
    estado.objetosFallidos === 0 &&
    estado.aplazados.length === 0 &&
    estado.noConcluyentes.length === 0 &&
    estado.creditosNoConfirmados === 0;
  if (limpio)
    return <Aviso tono="correcto">No hay archivos pendientes de borrar ni borrados de cuenta aplazados.</Aviso>;
  return (
    <div className="flex flex-col gap-3">
      {(estado.objetosPendientes > 0 || estado.objetosFallidos > 0) && (
        <Aviso tono={estado.objetosFallidos > 0 ? "error" : "aviso"}>
          Archivos de proyectos o cuentas borrados que el almacenamiento aún no ha dejado borrar:{" "}
          {estado.objetosPendientes} pendientes (el worker los reintenta con retroceso) y {estado.objetosFallidos}{" "}
          fallidos tras todos los intentos. Cuando el almacenamiento vuelva a responder, reintenta los fallidos.
        </Aviso>
      )}
      {estado.objetosFallidos > 0 && <ReintentarFallidos />}
      {estado.noConcluyentes.length > 0 && (
        <Aviso tono="aviso">
          Cuentas borradas con trabajos sin respuesta del proveedor (últimos 90 días):{" "}
          {estado.noConcluyentes
            .map((n) => `${n.id.slice(0, 8)} (${n.trabajos} el ${fechaYHora(n.terminado)})`)
            .join(", ")}
          . Su coste se apuntó estimado y no confirmado: el proveedor pudo cobrarlo a la instalación; compruébalo en su
          panel.
        </Aviso>
      )}
      {estado.creditosNoConfirmados > 0 && (
        <Aviso tono="info">
          Gasto no confirmado en cuentas borradas:{" "}
          {estado.creditosNoConfirmados.toLocaleString("es-ES", { maximumFractionDigits: 1 })} créditos. El proveedor no
          respondió; el coste es una estimación no confirmada (pudo cobrarlo o no a la instalación).
        </Aviso>
      )}
      {estado.aplazados.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-semibold text-texto">Borrados de cuenta que esperan más allá de su plazo</p>
          <ul className="flex flex-col gap-2">
            {estado.aplazados.map((a) => (
              <li key={a.id} className="rounded-tarjeta border border-borde p-3 text-sm">
                <p className="font-semibold text-texto">
                  Borrado <code className="font-mono">{a.id.slice(0, 8)}</code> · plazo {fechaYHora(a.plazo)} ·{" "}
                  {a.intentos} {a.intentos === 1 ? "intento" : "intentos"}
                </p>
                <p className="text-texto-suave">{a.motivo}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
