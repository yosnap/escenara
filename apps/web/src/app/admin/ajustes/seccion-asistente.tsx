"use client";

import { PenLine } from "lucide-react";
import { Interruptor } from "@/components/ui/choice";
import { Campo, EntradaTexto } from "@/components/ui/field";
import type { Ajustes } from "@/server/ajustes";
import { Seccion } from "./seccion-ajustes";

/**
 * Asistente de guion y presupuesto por proyecto (0.17.0).
 *
 * Los interruptores vienen apagados de fábrica y aquí se dice por qué: el asistente y la traducción llaman a un
 * modelo de texto, y eso cuesta dinero de la cuenta de cada usuario. Encenderlos no basta: hace falta además un
 * modelo `text_generation` seleccionable en `/admin/modelos`, es decir, uno que se haya ejecutado de verdad y
 * tenga su precio medido.
 *
 * «Mostrar el prompt a los usuarios» no cuesta nada: decide **quién ve** el texto compuesto (ADR-0022).
 */
export function SeccionAsistente({
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
      titulo="Asistente de guion y proyectos"
      descripcion="Si el asistente escribe guiones, si los prompts se traducen al inglés (las dos cosas cuestan créditos), quién ve el prompt y con qué presupuesto nace cada proyecto."
      icono={<PenLine />}
    >
      <Interruptor
        etiqueta="Traducir los prompts al inglés"
        descripcion="Lo que el usuario escribe en español se traduce en el servidor antes de componer el prompt (decisión firme del propietario). Es una llamada de pago al modelo de texto, se cachea por texto y entra en la estimación; lo que dice el personaje no se traduce. Apagado se envía el texto original."
        activo={valores.traducirPrompts}
        onCambio={(v) => onCambio("traducirPrompts", v)}
      />
      <Interruptor
        etiqueta="Usar los servicios de reserva cuando falle el modelo de texto"
        descripcion="Si el modelo de texto del catálogo no responde, devuelve un error o no tiene precio, la traducción y el asistente vuelven a pedir el mismo texto a los servicios compatibles con la API de OpenAI que cada usuario tenga en «Tu cuenta», recorriendo sus modelos en orden. Esos servicios se pagan por cuota del plan, no por petición: sus llamadas se apuntan con 0 créditos y lo que se guarda son los tokens."
        activo={valores.relevoTextoActivo}
        onCambio={(v) => onCambio("relevoTextoActivo", v)}
      />
      <Interruptor
        etiqueta="Mostrar el prompt a los usuarios"
        descripcion="Apagado: el prompt compuesto solo se ve en este panel (ADR-0022). Está preparado para los planes de pago; encenderlo enseña a cada usuario el texto exacto que se envía con sus trabajos."
        activo={valores.mostrarPromptAlUsuario}
        onCambio={(v) => onCambio("mostrarPromptAlUsuario", v)}
      />
      <Interruptor
        etiqueta="Asistente de guion activo"
        descripcion="Apagado, el guion se escribe a mano y no hay ninguna llamada de texto. Encendido, hace falta además un modelo de texto seleccionable en el catálogo y que cada usuario tenga su clave del proveedor."
        activo={valores.asistenteActivo}
        onCambio={(v) => onCambio("asistenteActivo", v)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Presupuesto por proyecto (créditos)"
          ayuda="Lo que se propone al crear un proyecto. Quien lo crea lo puede cambiar; sin presupuesto fijado, su plan no se puede aprobar."
          error={errorDe("presupuestoProyecto")}
        >
          {(p) => (
            <EntradaTexto
              {...p}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={Number.isNaN(valores.presupuestoProyecto) ? "" : valores.presupuestoProyecto}
              onChange={(e) =>
                onCambio("presupuestoProyecto", e.target.value === "" ? Number.NaN : Number(e.target.value))
              }
            />
          )}
        </Campo>
        <Campo
          etiqueta="Margen prudente de la estimación (%)"
          ayuda="Se suma a la estimación de las escenas cuyo modelo aún no está validado con coste medido. En el prototipo la estimación se quedó tres veces corta."
          error={errorDe("asistenteMargenEstimacion")}
        >
          {(p) => (
            <EntradaTexto
              {...p}
              type="number"
              min={0}
              max={200}
              step={1}
              inputMode="numeric"
              value={Number.isNaN(valores.asistenteMargenEstimacion) ? "" : valores.asistenteMargenEstimacion}
              onChange={(e) =>
                onCambio("asistenteMargenEstimacion", e.target.value === "" ? Number.NaN : Number(e.target.value))
              }
            />
          )}
        </Campo>
      </div>
    </Seccion>
  );
}
