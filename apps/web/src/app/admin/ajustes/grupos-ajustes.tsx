"use client";

import { Children, isValidElement, type ReactNode } from "react";
import { Selector } from "@/components/ui/select";
import { SeccionAccesoSocial } from "./seccion-acceso-social";
import { SeccionComunidad } from "./seccion-comunidad";
import { SeccionCorreo } from "./seccion-correo";
import { SeccionDatos } from "./seccion-datos";
import { SeccionLegal } from "./seccion-legal";
import { SeccionPrivacidad } from "./seccion-privacidad";

const grupos = [
  "Acceso y correo",
  "Generación y presupuesto",
  "Almacenamiento y datos",
  "Comunidad",
  "Privacidad y legal",
];
function grupoDe(nodo: ReactNode) {
  if (!isValidElement<{ titulo?: string }>(nodo)) return 1;
  if (
    nodo.type === SeccionCorreo ||
    nodo.type === SeccionAccesoSocial ||
    ["Registro", "Correo", "Seguridad"].includes(nodo.props.titulo ?? "")
  )
    return 0;
  if (nodo.type === SeccionDatos || nodo.props.titulo === "Almacenamiento") return 2;
  if (nodo.type === SeccionComunidad) return 3;
  if (nodo.type === SeccionLegal || nodo.type === SeccionPrivacidad) return 4;
  return 1;
}

/** Conserva los cambios montados; los grupos ocultos no bloquean la validación del grupo que se guarda. */
export function GruposAjustes({
  children,
  activo,
  cambiar,
}: {
  children: ReactNode;
  activo: number;
  cambiar: (grupo: number) => void;
}) {
  const nodos = Children.toArray(children);
  return (
    <>
      <Selector
        etiqueta="Grupo de configuración"
        valor={String(activo)}
        onCambio={(valor) => cambiar(Number(valor))}
        opciones={grupos.map((label, i) => ({ value: String(i), label }))}
      />
      <p>
        <a className="text-acento" href="/admin/marca">
          Marca →
        </a>{" "}
        ·{" "}
        <a className="text-acento" href="/admin/privacidad">
          Inventario de privacidad →
        </a>
      </p>
      {grupos.map((g, i) => (
        <fieldset key={g} hidden={activo !== i} disabled={activo !== i} className="m-0 min-w-0 space-y-5 border-0 p-0">
          {nodos.filter((n) => grupoDe(n) === i)}
        </fieldset>
      ))}
    </>
  );
}
