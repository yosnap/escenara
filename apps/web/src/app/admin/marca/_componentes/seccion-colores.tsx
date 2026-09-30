"use client";

import { EntradaTexto } from "@/components/ui/field";
import { CLAVES_TEMA, CLAVES_VIBRANTES, COLOR_HEX, type DocumentoMarca, MODOS_MARCA } from "@/lib/marca-esquema";

/** Nombres en castellano de los tokens, en el orden del editor. */
export const NOMBRE_TOKEN: Record<string, string> = {
  background: "Fondo",
  surface: "Superficie",
  surfaceRaised: "Superficie elevada",
  text: "Texto",
  textMuted: "Texto suave",
  border: "Borde",
  primary: "Acento",
  onPrimary: "Texto sobre el acento",
  focus: "Foco",
  brandSpark: "Chispa",
  creative: "Creativo",
  success: "Correcto",
  warning: "Aviso",
  danger: "Error",
  cobalt: "Cobalto",
  coral: "Coral",
  tangerine: "Mandarina",
  sun: "Sol",
  fuchsia: "Fucsia",
  cyan: "Cian",
};

const NOMBRE_MODO = { light: "Tema claro", dark: "Tema oscuro" } as const;

/**
 * Colores de los dos temas: cada token con su selector de color y su valor hexadecimal. Solo se admite `#RRGGBB`; lo
 * que no lo es se marca en su campo y la previsualización se queda con la última marca válida.
 */
export function SeccionColores({
  documento,
  errores,
  onCambio,
}: {
  documento: DocumentoMarca;
  errores: Map<string, string>;
  onCambio: (grupo: "theme" | "vibrant", modo: "light" | "dark", clave: string, valor: string) => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {MODOS_MARCA.map((modo) => (
        <fieldset key={modo} className="flex flex-col gap-2 rounded-tarjeta border border-borde/60 p-4">
          <legend className="px-1 text-lg font-bold text-texto">{NOMBRE_MODO[modo]}</legend>
          {CLAVES_TEMA.map((clave) => (
            <FilaColor
              key={clave}
              campo={`theme.${modo}.${clave}`}
              nombre={NOMBRE_TOKEN[clave] ?? clave}
              valor={documento.theme[modo][clave]}
              error={errores.get(`theme.${modo}.${clave}`)}
              onCambio={(v) => onCambio("theme", modo, clave, v)}
            />
          ))}
          <p className="mt-3 text-sm font-bold tracking-wide text-texto-suave uppercase">Vibrantes</p>
          {CLAVES_VIBRANTES.map((clave) => (
            <FilaColor
              key={clave}
              campo={`vibrant.${modo}.${clave}`}
              nombre={NOMBRE_TOKEN[clave] ?? clave}
              valor={documento.vibrant[modo][clave]}
              error={errores.get(`vibrant.${modo}.${clave}`)}
              onCambio={(v) => onCambio("vibrant", modo, clave, v)}
            />
          ))}
        </fieldset>
      ))}
    </div>
  );
}

function FilaColor({
  campo,
  nombre,
  valor,
  error,
  onCambio,
}: {
  campo: string;
  nombre: string;
  valor: string;
  error?: string;
  onCambio: (valor: string) => void;
}) {
  const id = `color-${campo.replaceAll(".", "-")}`;
  return (
    <div className="flex flex-col gap-1" data-requisito={`marca-${campo}`}>
      <div className="grid grid-cols-[1fr_3rem_7.5rem] items-center gap-2">
        <label htmlFor={id} className="text-sm font-medium text-texto">
          {nombre}
        </label>
        <input
          type="color"
          aria-label={`${nombre}: elegir color`}
          value={COLOR_HEX.test(valor) ? valor.toLowerCase() : "#000000"}
          onChange={(e) => onCambio(e.target.value.toUpperCase())}
          className="h-11 w-12 cursor-pointer rounded-control border border-borde bg-superficie p-1"
        />
        <EntradaTexto
          id={id}
          value={valor}
          maxLength={7}
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onCambio(e.target.value.trim())}
          className="font-mono text-sm"
        />
      </div>
      {/* alerta-permitida: mensaje de error de un campo, ligado con aria-describedby */}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-error">
          {error}
        </p>
      )}
    </div>
  );
}
