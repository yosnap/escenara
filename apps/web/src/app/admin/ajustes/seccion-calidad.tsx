"use client";

import { ScanFace } from "lucide-react";
import { Campo, EntradaTexto } from "@/components/ui/field";
import type { Ajustes } from "@/server/ajustes";
import { Seccion } from "./seccion-ajustes";

/**
 * Umbrales del control de calidad de la captura guiada (0.14.0). Se miden en el servidor con el mismo `sharp`
 * que reduce las imágenes al subirlas: **no gastan créditos ni llaman a ningún modelo**.
 *
 * Solo el tamaño mínimo es un límite duro; los demás avisan y el usuario puede añadir la foto de todas formas,
 * que es lo que evita que un umbral mal puesto deje a nadie sin poder trabajar.
 */
export function SeccionCalidad({
  valores,
  errorDe,
  onCambio,
}: {
  valores: Ajustes;
  errorDe: (campo: keyof Ajustes) => string | undefined;
  onCambio: <K extends keyof Ajustes>(clave: K, valor: Ajustes[K]) => void;
}) {
  /** Todos los umbrales son números: un campo vacío es `NaN` y el servidor lo rechaza con su mensaje. */
  const numero =
    <K extends keyof Ajustes>(clave: K) =>
    (texto: string) =>
      onCambio(clave, (texto === "" ? Number.NaN : Number(texto)) as Ajustes[K]);

  return (
    <Seccion
      titulo="Calidad de las fotos de referencia"
      descripcion="Cuándo se rechaza una foto por pequeña, borrosa o mal iluminada. Se mide en esta instalación, sin gastar créditos."
      icono={<ScanFace />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Lado menor mínimo (píxeles)"
          ayuda="Único límite duro: por debajo, la foto no se guarda ni con «usar de todas formas». 512 va bien para fotos de móvil."
          error={errorDe("calidadLadoMinimo")}
        >
          {(p) => (
            <EntradaTexto
              {...p}
              type="number"
              min={64}
              max={4096}
              step={1}
              inputMode="numeric"
              value={Number.isNaN(valores.calidadLadoMinimo) ? "" : valores.calidadLadoMinimo}
              onChange={(e) => numero("calidadLadoMinimo")(e.target.value)}
            />
          )}
        </Campo>
        <Campo
          etiqueta="Enfoque mínimo"
          ayuda="Varianza del laplaciano: una foto de móvil enfocada pasa de 40 y una movida no llega a 8. 0 desactiva la comprobación."
          error={errorDe("calidadNitidezMinima")}
        >
          {(p) => (
            <EntradaTexto
              {...p}
              type="number"
              min={0}
              step={0.5}
              inputMode="decimal"
              value={Number.isNaN(valores.calidadNitidezMinima) ? "" : valores.calidadNitidezMinima}
              onChange={(e) => numero("calidadNitidezMinima")(e.target.value)}
            />
          )}
        </Campo>
        <Campo
          etiqueta="Luz mínima (0–255)"
          ayuda="Luminancia media por debajo de la cual la cara se pierde en la sombra."
          error={errorDe("calidadLuminosidadMinima")}
        >
          {(p) => (
            <EntradaTexto
              {...p}
              type="number"
              min={0}
              max={254}
              step={1}
              inputMode="numeric"
              value={Number.isNaN(valores.calidadLuminosidadMinima) ? "" : valores.calidadLuminosidadMinima}
              onChange={(e) => numero("calidadLuminosidadMinima")(e.target.value)}
            />
          )}
        </Campo>
        <Campo
          etiqueta="Luz máxima (0–255)"
          ayuda="Por encima, los rasgos se pierden en el blanco. Tiene que ser mayor que la mínima."
          error={errorDe("calidadLuminosidadMaxima")}
        >
          {(p) => (
            <EntradaTexto
              {...p}
              type="number"
              min={1}
              max={255}
              step={1}
              inputMode="numeric"
              value={Number.isNaN(valores.calidadLuminosidadMaxima) ? "" : valores.calidadLuminosidadMaxima}
              onChange={(e) => numero("calidadLuminosidadMaxima")(e.target.value)}
            />
          )}
        </Campo>
        <Campo
          etiqueta="Tamaño mínimo de la cara (% del lado menor)"
          ayuda="Lo mide el navegador de cada usuario, así que solo avisa donde existe el detector de caras. 0 lo desactiva."
          error={errorDe("calidadCaraMinima")}
        >
          {(p) => (
            <EntradaTexto
              {...p}
              type="number"
              min={0}
              max={90}
              step={1}
              inputMode="numeric"
              value={Number.isNaN(valores.calidadCaraMinima) ? "" : valores.calidadCaraMinima}
              onChange={(e) => numero("calidadCaraMinima")(e.target.value)}
            />
          )}
        </Campo>
      </div>
      <p className="text-sm text-texto-suave">
        Las fotos repetidas se detectan con una huella perceptual, que no se configura: dos fotos casi idénticas no
        aportan identidad y no se guardan dos veces.
      </p>
    </Seccion>
  );
}
