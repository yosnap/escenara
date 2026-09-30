"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Boton } from "@/components/ui/button";
import { TarjetaCuenta } from "@/components/ui/cuenta";
import { Aviso } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { authCliente } from "@/lib/auth-cliente";
import { mensajeError } from "@/lib/errores-auth";

export function FormularioRecuperar() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pedir = async (evento: FormEvent) => {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    const { error } = await authCliente.requestPasswordReset({ email, redirectTo: "/restablecer" });
    setEnviando(false);
    if (error) return setError(mensajeError(error));
    setEnviado(true);
  };

  return (
    <TarjetaCuenta
      titulo="Recupera tu contraseña"
      descripcion="Escribe el correo de tu cuenta y te enviaremos un enlace para elegir una contraseña nueva."
      pie={
        <Link href="/entrar" className="font-semibold text-acento underline-offset-4 hover:underline">
          Volver a entrar
        </Link>
      }
    >
      {enviado ? (
        // El mensaje es el mismo exista o no la cuenta: no revela qué correos están registrados.
        <Aviso tono="correcto">Si hay una cuenta con ese correo, te hemos enviado el enlace. Caduca en una hora.</Aviso>
      ) : (
        <form onSubmit={pedir} className="flex flex-col gap-4">
          <Campo etiqueta="Correo">
            {(p) => (
              <EntradaTexto
                {...p}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Campo>
          {error && <Aviso tono="error">{error}</Aviso>}
          <Boton type="submit" cargando={enviando}>
            Enviar enlace
          </Boton>
        </form>
      )}
    </TarjetaCuenta>
  );
}
