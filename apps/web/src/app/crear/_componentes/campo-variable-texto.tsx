"use client";

import { AreaTexto, Campo } from "@/components/ui/field";
import { PROMPT_MINIMO } from "@/lib/generacion";
import { type PlantillaVisible, VARIABLE_TEXTO_MAXIMA, type VariablePlantilla } from "@/lib/presets";
import { ID_DESCRIPCION } from "@/lib/requisitos";

/**
 * **La variable de texto de la plantilla o del trend elegido**, escrita donde la persona está. Con una imagen tuya no
 * hay paso «Describe la escena», y sin él la variable obligatoria (por ejemplo «Qué ocurre en la escena») se quedaba
 * sin ningún sitio donde escribirla mientras la confirmación decía que faltaba.
 *
 * Es **el mismo dato** que el campo «Qué quieres ver» de ese paso (la descripción): no hay un segundo texto que pueda
 * divergir, y por eso solo se pinta cuando el paso de la escena no existe. Su etiqueta es la de la variable.
 */
export function CampoVariableTexto({
  variable,
  plantilla,
  valor,
  deshabilitado,
  error,
  onCambio,
}: {
  variable: VariablePlantilla;
  plantilla: PlantillaVisible;
  valor: string;
  deshabilitado: boolean;
  /** Lo que falta de este campo, si algo. */
  error?: string;
  onCambio: (texto: string) => void;
}) {
  const largo = valor.trim().length;
  return (
    <Campo
      etiqueta={variable.obligatoria ? variable.etiqueta : `${variable.etiqueta} (opcional)`}
      requisito={ID_DESCRIPCION}
      error={error}
      ayuda={
        <>
          {plantilla.kind === "trend" ? "Lo usa el trend" : "Lo usa el formato"} «{plantilla.nombre}» para componer el
          clip: cuenta qué ocurre y cómo se ve. {variable.obligatoria ? "Mínimo" : "Vacío o, si lo escribes, al menos"}{" "}
          {PROMPT_MINIMO} caracteres.{" "}
          <span className="font-mono">
            {largo}/{VARIABLE_TEXTO_MAXIMA}
          </span>
          {largo > VARIABLE_TEXTO_MAXIMA && (
            <strong className="font-semibold text-texto">
              {" "}
              Al componer el prompt se enviarán solo los primeros {VARIABLE_TEXTO_MAXIMA} caracteres: acórtalo tú para
              decidir qué se queda.
            </strong>
          )}
        </>
      }
    >
      {(props) => (
        <AreaTexto
          {...props}
          value={valor}
          disabled={deshabilitado}
          onChange={(e) => onCambio(e.target.value)}
          placeholder="Ej.: abro la caja con cuidado y el producto aparece entre el papel de seda."
        />
      )}
    </Campo>
  );
}
