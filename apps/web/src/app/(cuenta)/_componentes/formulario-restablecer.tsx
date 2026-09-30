"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Boton } from "@/components/ui/button";
import { TarjetaCuenta } from "@/components/ui/cuenta";
import { EntradaContrasena } from "@/components/ui/entrada-contrasena";
import { Aviso } from "@/components/ui/feedback";
import { Campo } from "@/components/ui/field";
import { authCliente } from "@/lib/auth-cliente";
import { mensajeError } from "@/lib/errores-auth";

export function FormularioRestablecer({ token }: { token: string | null }) {
  const [clave, setClave] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pie = (
    <Link href="/recuperar" className="font-semibold text-acento underline-offset-4 hover:underline">
      Pedir un enlace nuevo
    </Link>
  );

  if (!token) {
    return (
      <TarjetaCuenta titulo="Enlace no válido" pie={pie}>
        <Aviso tono="error">El enlace para cambiar la contraseña no es válido o ha caducado.</Aviso>
      </TarjetaCuenta>
    );
  }

  const guardar = async (evento: FormEvent) => {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    const { error } = await authCliente.resetPassword({ newPassword: clave, token });
    setEnviando(false);
    if (error) return setError(mensajeError(error));
    window.location.assign("/entrar?aviso=restablecida");
  };

  return (
    <TarjetaCuenta
      titulo="Elige una contraseña nueva"
      descripcion="Al guardarla se cerrarán las sesiones abiertas en otros dispositivos."
      pie={pie}
    >
      <form onSubmit={guardar} className="flex flex-col gap-4">
        <Campo etiqueta="Contraseña nueva" ayuda="Al menos 10 caracteres.">
          {(p) => (
            <EntradaContrasena
              {...p}
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              value={clave}
              onChange={(e) => setClave(e.target.value)}
            />
          )}
        </Campo>
        {error && <Aviso tono="error">{error}</Aviso>}
        <Boton type="submit" cargando={enviando}>
          Guardar contraseña
        </Boton>
      </form>
    </TarjetaCuenta>
  );
}
