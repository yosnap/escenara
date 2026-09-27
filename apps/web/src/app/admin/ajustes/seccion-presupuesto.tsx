"use client";

import { PiggyBank } from "lucide-react";
import { CampoSecreto } from "@/components/ui/campo-secreto";
import { Campo, EntradaTexto } from "@/components/ui/field";
import type { Ajustes } from "@/server/ajustes";
import type { ClaveSecreta } from "@/server/boveda/secretos";
import { Seccion } from "./seccion-ajustes";

/**
 * Presupuesto autorizado por usuario, tope por trabajo, trabajos simultáneos y callbacks del proveedor.
 *
 * La URL pública y el secreto van juntos a propósito: sin los dos no se atiende ningún callback, y el sondeo
 * del worker funciona igual con callbacks o sin ellos.
 */
export function SeccionPresupuesto({
  valores,
  pista,
  bovedaLista,
  errorDe,
  onCambio,
  onGuardarSecreto,
  onQuitarSecreto,
}: {
  valores: Ajustes;
  pista: (clave: ClaveSecreta) => string | null;
  bovedaLista: boolean;
  errorDe: (campo: keyof Ajustes) => string | undefined;
  onCambio: <K extends keyof Ajustes>(clave: K, valor: Ajustes[K]) => void;
  onGuardarSecreto: (clave: ClaveSecreta, valor: string) => Promise<boolean>;
  onQuitarSecreto: (clave: ClaveSecreta) => Promise<void>;
}) {
  return (
    <Seccion
      titulo="Presupuesto y cola"
      descripcion="Cuánto autorizas a comprometer a cada usuario y cuántos trabajos atiende la cola a la vez."
      icono={<PiggyBank />}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo
          etiqueta="Presupuesto por usuario (créditos)"
          ayuda="Tope de créditos que cada usuario puede comprometer (reservados + consumidos). 0 = sin tope propio."
          error={errorDe("presupuestoCreditos")}
        >
          {(p) => (
            <EntradaTexto
              {...p}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={Number.isNaN(valores.presupuestoCreditos) ? "" : valores.presupuestoCreditos}
              onChange={(e) =>
                onCambio("presupuestoCreditos", e.target.value === "" ? Number.NaN : Number(e.target.value))
              }
            />
          )}
        </Campo>
        <Campo
          etiqueta="Tope por trabajo (créditos)"
          ayuda="Ningún trabajo suelto puede reservar más que esto. 0 = sin tope por trabajo."
          error={errorDe("presupuestoTrabajo")}
        >
          {(p) => (
            <EntradaTexto
              {...p}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={Number.isNaN(valores.presupuestoTrabajo) ? "" : valores.presupuestoTrabajo}
              onChange={(e) =>
                onCambio("presupuestoTrabajo", e.target.value === "" ? Number.NaN : Number(e.target.value))
              }
            />
          )}
        </Campo>
        <Campo
          etiqueta="Trabajos simultáneos por usuario"
          ayuda="Cuántos trabajos puede tener a la vez en cola o en el proveedor."
          error={errorDe("trabajosSimultaneos")}
        >
          {(p) => (
            <EntradaTexto
              {...p}
              type="number"
              min={1}
              max={50}
              step={1}
              inputMode="numeric"
              value={Number.isNaN(valores.trabajosSimultaneos) ? "" : valores.trabajosSimultaneos}
              onChange={(e) =>
                onCambio("trabajosSimultaneos", e.target.value === "" ? Number.NaN : Number(e.target.value))
              }
            />
          )}
        </Campo>
        <Campo
          etiqueta="Escenas en vuelo por usuario"
          ayuda="Cuántas escenas de un proyecto puede tener produciéndose a la vez. Cada escena son dos trabajos (fotograma y clip), así que esto acota el gasto comprometido antes de que vea ni un fotograma."
          error={errorDe("escenasEnVuelo")}
        >
          {(p) => (
            <EntradaTexto
              {...p}
              type="number"
              min={1}
              max={24}
              step={1}
              inputMode="numeric"
              value={Number.isNaN(valores.escenasEnVuelo) ? "" : valores.escenasEnVuelo}
              onChange={(e) => onCambio("escenasEnVuelo", e.target.value === "" ? Number.NaN : Number(e.target.value))}
            />
          )}
        </Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="URL pública de esta instalación"
          ayuda="Con ella se activan los callbacks del proveedor. Vacía: solo se usa el sondeo del worker, que funciona igual."
          error={errorDe("urlPublica")}
        >
          {(p) => (
            <EntradaTexto
              {...p}
              placeholder="https://escenara.tudominio.com"
              value={valores.urlPublica}
              onChange={(e) => onCambio("urlPublica", e.target.value)}
            />
          )}
        </Campo>
        <CampoSecreto
          etiqueta="Secreto de los callbacks"
          pista={pista("secretoCallback")}
          vacio="Se guarda cifrado. Sin él no se atiende ningún callback, aunque haya URL pública."
          deshabilitado={!bovedaLista}
          tituloQuitar="¿Quitar el secreto de los callbacks?"
          descripcionQuitar="Dejarán de atenderse los callbacks del proveedor. El sondeo del worker sigue funcionando."
          onGuardar={(valor) => onGuardarSecreto("secretoCallback", valor)}
          onQuitar={() => onQuitarSecreto("secretoCallback")}
        />
      </div>
      {valores.urlPublica.trim() !== "" && (
        <p className="text-sm text-texto-suave">
          Dirección que hay que dar al proveedor:{" "}
          <code className="font-mono">{`${valores.urlPublica.replace(/\/$/, "")}/api/generacion/callback/kie`}</code>.
          El cuerpo va firmado con HMAC-SHA256 en la cabecera <code className="font-mono">x-escenara-firma</code>.
        </p>
      )}
    </Seccion>
  );
}
