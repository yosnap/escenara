"use client";

import { Database } from "lucide-react";
import { Campo, EntradaTexto } from "@/components/ui/field";
import type { Ajustes } from "@/server/ajustes";
import type { AjustesDatos } from "@/server/ajustes-datos";
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
}: {
  valores: Ajustes;
  errorDe: (campo: keyof Ajustes) => string | undefined;
  onCambio: <K extends keyof Ajustes>(clave: K, valor: Ajustes[K]) => void;
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
    </Seccion>
  );
}
