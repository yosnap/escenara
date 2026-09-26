"use client";

import { Eye, EyeOff } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { useState } from "react";
import { cn } from "./cn";
import { claseControl } from "./field";

/** Contraseña con botón para mostrarla u ocultarla (útil en móvil y para quien usa gestores de claves). */
export function EntradaContrasena({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        className={cn(claseControl, "min-h-11 pr-12", className)}
        spellCheck={false}
        autoCapitalize="none"
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-control text-texto-suave hover:text-texto"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
