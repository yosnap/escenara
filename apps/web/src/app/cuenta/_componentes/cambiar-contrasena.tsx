"use client";

import { LockKeyhole } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Boton } from "@/components/ui/button";
import { EntradaContrasena } from "@/components/ui/entrada-contrasena";
import { Aviso } from "@/components/ui/feedback";
import { Campo } from "@/components/ui/field";
import { authCliente } from "@/lib/auth-cliente";
import { mensajeError } from "@/lib/errores-auth";
import { Bloque } from "./bloque";

export function CambiarContrasena() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [estado, setEstado] = useState<"inicio" | "guardando" | "guardado">("inicio");
  const [error, setError] = useState<string | null>(null);

  const guardar = async (evento: FormEvent) => {
    evento.preventDefault();
    setEstado("guardando");
    setError(null);
    const { error } = await authCliente.changePassword({
      currentPassword: actual,
      newPassword: nueva,
      revokeOtherSessions: true,
    });
    if (error) {
      setEstado("inicio");
      return setError(mensajeError(error));
    }
    setActual("");
    setNueva("");
    setEstado("guardado");
  };

  return (
    <Bloque
      titulo="Contraseña"
      descripcion="Al cambiarla se cierran las sesiones abiertas en otros dispositivos."
      icono={<LockKeyhole />}
    >
      <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Contraseña actual">
          {(p) => (
            <EntradaContrasena
              {...p}
              autoComplete="current-password"
              required
              value={actual}
              onChange={(e) => setActual(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Contraseña nueva" ayuda="Al menos 10 caracteres.">
          {(p) => (
            <EntradaContrasena
              {...p}
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
            />
          )}
        </Campo>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Boton type="submit" cargando={estado === "guardando"}>
            Cambiar contraseña
          </Boton>
          {estado === "guardado" && <Aviso tono="correcto">Contraseña cambiada</Aviso>}
          {error && <Aviso tono="error">{error}</Aviso>}
        </div>
      </form>
    </Bloque>
  );
}
