import { Scale } from "lucide-react";
import { Campo, EntradaTexto } from "@/components/ui/field";
import type { Ajustes } from "@/server/ajustes";
import { Seccion } from "./seccion-ajustes";

export function SeccionLegal({
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
      titulo="Información legal"
      descripcion="Estos datos se publican en las páginas legales. Completa el titular real de esta instalación y revisa los textos antes de abrir el registro."
      icono={<Scale />}
    >
      {(
        [
          ["legalTitular", "Nombre o razón social", 200],
          ["legalNif", "NIF/CIF", 40],
          ["legalDomicilio", "Domicilio", 400],
          ["legalCorreo", "Correo de privacidad y contacto", 254],
          ["legalRegistro", "Datos registrales (si corresponden)", 400],
        ] as const
      ).map(([clave, etiqueta, max]) => (
        <Campo key={clave} etiqueta={etiqueta} error={errorDe(clave)}>
          {(p) => (
            <EntradaTexto
              {...p}
              type={clave === "legalCorreo" ? "email" : "text"}
              maxLength={max}
              value={valores[clave]}
              onChange={(e) => onCambio(clave, e.target.value)}
            />
          )}
        </Campo>
      ))}
      <a
        href="/legal/aviso"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center font-semibold text-acento underline"
      >
        Revisar las páginas legales (se abre en otra pestaña)
      </a>
    </Seccion>
  );
}
