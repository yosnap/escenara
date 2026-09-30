import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { useId } from "react";
import { cn } from "./cn";

export const claseControl =
  "w-full rounded-control border border-borde bg-superficie px-3.5 py-2.5 text-base text-texto placeholder:text-texto-suave transition-colors duration-(--motion-fast) hover:border-acento focus-visible:border-acento aria-invalid:border-error aria-invalid:ring-2 aria-invalid:ring-error disabled:opacity-50";

interface CampoProps {
  etiqueta: string;
  ayuda?: ReactNode;
  error?: string;
  /** Marca del campo para llegar a él desde un aviso de requisitos (`data-requisito`). */
  requisito?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}

/** Envoltorio de campo: etiqueta, ayuda y error asociados al control para lectores de pantalla. */
export function Campo({ etiqueta, ayuda, error, requisito, children }: CampoProps) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const descritoPor = [ayuda && idAyuda, error && idError].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5" data-requisito={requisito}>
      <label htmlFor={id} className="text-sm font-semibold text-texto">
        {etiqueta}
      </label>
      {children({ id, "aria-describedby": descritoPor, "aria-invalid": error ? true : undefined })}
      {ayuda && (
        <p id={idAyuda} className="text-sm text-texto-suave">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} className="flex items-center gap-1 text-sm font-medium text-error">
          <span aria-hidden>●</span> {error}
        </p>
      )}
    </div>
  );
}

/**
 * Atributos que piden a los gestores de contraseñas (LastPass, 1Password, Bitwarden, Dashlane) que no decoren un
 * campo. Hay que ponérselos a todo lo que **no** es una credencial: si no, LastPass mete su propio `<div>` dentro
 * del grupo del campo antes de que React hidrate, el HTML deja de coincidir y React rehace la página entera en
 * el cliente.
 */
export const SIN_GESTOR_CONTRASENAS = {
  autoComplete: "off",
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
} as const;

/**
 * Campo de texto. Si declara un `autoComplete` de verdad (email, nombre, contraseña) es un dato de acceso o de
 * identidad y los gestores pueden rellenarlo; si no, se les pide que lo dejen en paz.
 */
export function EntradaTexto({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const esCredencial = props.type === "password" || (props.autoComplete !== undefined && props.autoComplete !== "off");
  return (
    <input
      className={cn(claseControl, "min-h-11", className)}
      {...(esCredencial ? {} : SIN_GESTOR_CONTRASENAS)}
      {...props}
    />
  );
}

export function AreaTexto({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(claseControl, "min-h-28 resize-y", className)} {...props} />;
}
