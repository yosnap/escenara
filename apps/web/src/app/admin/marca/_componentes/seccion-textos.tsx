"use client";

import { Campo, EntradaTexto } from "@/components/ui/field";
import type { DocumentoMarca } from "@/lib/marca-esquema";

type CampoTexto = { ruta: string; etiqueta: string; max: number; leer: (d: DocumentoMarca) => string };

const CAMPOS: CampoTexto[] = [
  { ruta: "identity.name", etiqueta: "Nombre de la instalación", max: 40, leer: (d) => d.identity.name },
  { ruta: "identity.tagline.es", etiqueta: "Lema (español)", max: 80, leer: (d) => d.identity.tagline.es },
  { ruta: "identity.tagline.en", etiqueta: "Lema (inglés)", max: 80, leer: (d) => d.identity.tagline.en },
  {
    ruta: "identity.descriptor.es",
    etiqueta: "Descripción (español)",
    max: 120,
    leer: (d) => d.identity.descriptor.es,
  },
  { ruta: "identity.descriptor.en", etiqueta: "Descripción (inglés)", max: 120, leer: (d) => d.identity.descriptor.en },
];

/**
 * Textos de marca: el nombre, el lema y la descripción, que salen en el título de las pestañas, en la cabecera y al
 * compartir un enlace. Sin marcado ni saltos de línea: se escapan al pintarse y además el esquema los rechaza.
 */
export function SeccionTextos({
  documento,
  errores,
  onCambio,
}: {
  documento: DocumentoMarca;
  errores: Map<string, string>;
  onCambio: (ruta: string, valor: string) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {CAMPOS.map((c) => (
        <Campo key={c.ruta} etiqueta={c.etiqueta} error={errores.get(c.ruta)} requisito={`marca-${c.ruta}`}>
          {(props) => (
            <EntradaTexto
              {...props}
              value={c.leer(documento)}
              maxLength={c.max}
              onChange={(e) => onCambio(c.ruta, e.target.value)}
            />
          )}
        </Campo>
      ))}
    </div>
  );
}
