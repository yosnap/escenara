import type { CSSProperties } from "react";
import type { DocumentoMarca, ModoMarca } from "./marca-esquema";
import { exigirMarcaSegura } from "./tokens";

/**
 * Variables de un tema de la marca como **estilo en línea** de un contenedor: dentro de él, los componentes reales
 * (que usan `var(--primary)`, `var(--surface)`…) se pintan con la marca que se está editando, y fuera nada cambia. Así
 * la previsualización enseña los dos temas a la vez, uno al lado del otro, sin tocar la página.
 *
 * Solo se llama con un documento que ha pasado el esquema, y aun así se comprueba cada valor antes de devolverlo.
 */
const kebab = (nombre: string) => nombre.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`);

export function estiloDeTema(marca: DocumentoMarca, modo: ModoMarca): CSSProperties {
  exigirMarcaSegura(marca);
  const variables: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(marca.theme[modo])) variables[`--${kebab(clave)}`] = valor;
  for (const [clave, valor] of Object.entries(marca.vibrant[modo])) variables[`--vibrant-${kebab(clave)}`] = valor;
  for (const [nombre, paradas] of Object.entries(marca.gradients)) {
    variables[`--gradient-${nombre}`] =
      `linear-gradient(135deg, ${paradas.map((p) => `var(--vibrant-${kebab(p)})`).join(", ")})`;
  }
  variables["--radius-control"] = `${marca.layout.controlRadiusPx}px`;
  variables["--radius-card"] = `${marca.layout.cardRadiusPx}px`;
  variables["--font-manrope"] = marca.typography.family;
  variables["--font-family"] = marca.typography.family;
  return {
    ...(variables as CSSProperties),
    colorScheme: modo,
    fontFamily: marca.typography.family,
    background: marca.theme[modo].background,
    color: marca.theme[modo].text,
  };
}
