"use client";

import { useActionState, useEffect, useState } from "react";
import { Alerta } from "@/components/ui/alerta";
import { estiloCampoAdmin } from "../estilos-admin";
import { SelectorAdmin as Selector } from "../selector-admin";
import { gestionarUsuario } from "./acciones";

export function FormularioUsuario({
  id,
  email,
  bloqueado,
  verificado,
  borrado,
  politica,
  operacionInicial,
}: {
  id: string;
  email: string;
  bloqueado: boolean;
  verificado: boolean;
  borrado: boolean;
  politica?: { budgetMode: string; budgetValue: number | null; jobMode: string; jobValue: number | null } | null;
  operacionInicial: string;
}) {
  const [resultado, accion, pendiente] = useActionState(gestionarUsuario, { ok: false, mensaje: "" });
  const [operacion, setOperacion] = useState(operacionInicial);
  useEffect(() => {
    if (resultado.ok) setOperacion(crypto.randomUUID());
  }, [resultado]);
  const [modoBudget, setBudget] = useState(politica?.budgetMode ?? "heredar");
  const [modoJob, setJob] = useState(politica?.jobMode ?? "heredar");
  return (
    <form action={accion} className="space-y-4 rounded-control border border-borde p-4">
      <input type="hidden" name="usuario" value={id} />
      <input type="hidden" name="operacion" value={operacion} />
      <p>
        Destinatario: <strong className="break-all">{email}</strong>
      </p>
      <label className="flex flex-col gap-1">
        Motivo (sin datos privados)
        <input required name="motivo" minLength={3} maxLength={300} className={estiloCampoAdmin} />
      </label>
      <fieldset disabled={pendiente || borrado || bloqueado} className="space-y-3">
        <legend className="font-bold">Tope interno de la aplicación</legend>
        <p className="text-sm text-texto-suave">
          No es el saldo BYOK. Conserva la política histórica de unidades agregadas; los créditos de distintos
          proveedores no equivalen entre sí. Bajar el límite no borra gastos ni reservas.
        </p>
        {(
          [
            ["budget", "Presupuesto", modoBudget, setBudget, politica?.budgetValue],
            ["job", "Tope por trabajo", modoJob, setJob, politica?.jobValue],
          ] as const
        ).map(([nombre, titulo, modo, cambiar, valor]) => (
          <div key={nombre} className="flex flex-wrap gap-3">
            <Selector
              etiqueta={titulo}
              nombre={`${nombre}Mode`}
              className="w-full min-w-0 sm:w-64"
              valor={modo}
              onCambio={(v) => cambiar(v ?? "heredar")}
              opciones={[
                { value: "heredar", label: "Heredar" },
                { value: "sin-tope", label: "Sin tope" },
                { value: "limite", label: "Límite" },
              ]}
            />
            <label className="flex flex-col gap-1">
              Valor
              <input
                name={`${nombre}Value`}
                type="number"
                step="any"
                min="0.000001"
                required={modo === "limite"}
                disabled={modo !== "limite"}
                defaultValue={valor ?? ""}
                className={estiloCampoAdmin}
              />
            </label>
            {modo !== "limite" && <input type="hidden" name={`${nombre}Value`} value="" />}
          </div>
        ))}
        <button type="submit" name="accion" value="politica" className={estiloCampoAdmin}>
          Guardar límites
        </button>
      </fieldset>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="confirmar" required />
        Confirmo la cuenta destinataria y esta acción.
      </label>
      <div className="flex flex-wrap gap-3">
        {!verificado && (
          <>
            <button
              type="submit"
              disabled={pendiente || borrado || bloqueado}
              name="accion"
              value="activar"
              formNoValidate
              className={estiloCampoAdmin}
            >
              Activar manualmente
            </button>
            <button
              type="submit"
              disabled={pendiente || borrado || bloqueado}
              name="accion"
              value="correo"
              formNoValidate
              className={estiloCampoAdmin}
            >
              Reenviar activación
            </button>
          </>
        )}
        <button
          type="submit"
          disabled={pendiente || borrado}
          name="accion"
          value={bloqueado ? "desbloquear" : "bloquear"}
          formNoValidate
          className={estiloCampoAdmin}
        >
          {bloqueado ? "Desbloquear" : "Bloquear"}
        </button>
        <button
          type="submit"
          formNoValidate
          disabled={pendiente}
          name="accion"
          value="revocar"
          className={estiloCampoAdmin}
        >
          Revocar sesiones
        </button>
      </div>
      {resultado.mensaje && <Alerta tipo={resultado.ok ? "hecho" : "error"}>{resultado.mensaje}</Alerta>}
    </form>
  );
}
