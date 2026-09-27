"use client";

import { ShieldAlert } from "lucide-react";
import { Interruptor } from "@/components/ui/choice";
import { Campo, EntradaTexto } from "@/components/ui/field";
import type { Ajustes } from "@/server/ajustes";
import { Seccion } from "./seccion-ajustes";

/**
 * Parámetros del motor de controles previos (RF12, 0.18.0).
 *
 * **Aquí no se editan reglas**, solo sus umbrales: las reglas viven en el código
 * (`server/controles/motor.ts`), son deterministas y se revisan como código (decisión provisional del
 * propietario, 2026-09-27). Los frenos duros —credencial, consentimiento, formato del modelo y
 * presupuesto— no son configurables a propósito: se apagan cambiando el código, no desde un panel.
 */
export function SeccionControles({
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
      titulo="Controles previos"
      descripcion="Qué avisa el panel «Antes de generar» además de los frenos que no se pueden saltar."
      icono={<ShieldAlert />}
    >
      <Interruptor
        etiqueta="Avisar si el precio del modelo es antiguo"
        descripcion="Si el precio se comprobó hace más de 90 días, generar exige confirmar que aceptas la estimación tal cual."
        activo={valores.controlesExigirPrecioFresco}
        onCambio={(v) => onCambio("controlesExigirPrecioFresco", v)}
      />
      <Interruptor
        etiqueta="Avisar si faltan vistas del personaje"
        descripcion="Si faltan fotos de alguna vista mínima, o el control de calidad señaló alguna, generar exige confirmarlo. Apagado de fábrica: solo tiene sentido si usas la captura guiada."
        activo={valores.controlesExigirCoberturaVistas}
        onCambio={(v) => onCambio("controlesExigirCoberturaVistas", v)}
      />
      <Campo
        etiqueta="Avisos confirmables a la vez"
        ayuda="Pasado ese número hay que arreglar algo: una pantalla con seis casillas de «sé lo que hago» no es una confirmación informada."
        error={errorDe("controlesMaximoAvisos")}
      >
        {(p) => (
          <EntradaTexto
            {...p}
            type="number"
            min={1}
            max={10}
            step={1}
            inputMode="numeric"
            className="max-w-48"
            value={Number.isNaN(valores.controlesMaximoAvisos) ? "" : valores.controlesMaximoAvisos}
            onChange={(e) =>
              onCambio("controlesMaximoAvisos", e.target.value === "" ? Number.NaN : Number(e.target.value))
            }
          />
        )}
      </Campo>
    </Seccion>
  );
}
