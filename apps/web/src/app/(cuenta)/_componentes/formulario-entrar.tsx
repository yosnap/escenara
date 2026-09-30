"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Alerta } from "@/components/ui/alerta";
import { Boton } from "@/components/ui/button";
import type { Proveedor } from "@/components/ui/cuenta";
import { TarjetaCuenta } from "@/components/ui/cuenta";
import { EntradaContrasena } from "@/components/ui/entrada-contrasena";
import { Aviso } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { authCliente } from "@/lib/auth-cliente";
import { mensajeError } from "@/lib/errores-auth";
import { AccesoExterno } from "./acceso-externo";

export function FormularioEntrar({
  volver,
  proveedores,
  registroAbierto,
  aviso,
}: {
  volver: string;
  proveedores: Proveedor[];
  registroAbierto: boolean;
  aviso?: string;
}) {
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinVerificar, setSinVerificar] = useState(false);

  const entrar = async (evento: FormEvent) => {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    setSinVerificar(false);
    const { error } = await authCliente.signIn.email({ email, password: clave, callbackURL: volver });
    if (error) {
      setEnviando(false);
      setSinVerificar(error.code === "EMAIL_NOT_VERIFIED");
      setError(mensajeError(error));
      return;
    }
    // Navegación completa: el servidor vuelve a pintar con el tema y el idioma del usuario.
    window.location.assign(volver);
  };

  return (
    <TarjetaCuenta
      titulo="Entrar"
      descripcion="Te damos la bienvenida de nuevo a tu estudio."
      pie={
        registroAbierto ? (
          <>
            ¿No tienes cuenta?{" "}
            <Link href="/registro" className="font-semibold text-acento underline-offset-4 hover:underline">
              Crea una
            </Link>
          </>
        ) : undefined
      }
    >
      {aviso && <Aviso tono="correcto">{aviso}</Aviso>}
      <AccesoExterno proveedores={proveedores} volver={volver} conPasskey onError={setError} />
      <form onSubmit={entrar} className="flex flex-col gap-4">
        <Campo etiqueta="Correo">
          {(p) => (
            <EntradaTexto
              {...p}
              type="email"
              autoComplete="username webauthn"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Contraseña">
          {(p) => (
            <EntradaContrasena
              {...p}
              autoComplete="current-password"
              required
              value={clave}
              onChange={(e) => setClave(e.target.value)}
            />
          )}
        </Campo>
        <Link
          href="/recuperar"
          className="-mt-2 self-end text-sm font-semibold text-acento underline-offset-4 hover:underline"
        >
          ¿Has olvidado la contraseña?
        </Link>
        {error && (
          <Alerta
            tipo="error"
            compacta
            accion={
              sinVerificar && (
                <Link
                  href={`/verificar?email=${encodeURIComponent(email)}`}
                  className="inline-flex min-h-11 items-center font-semibold text-acento underline"
                >
                  Reenviar el enlace de confirmación
                </Link>
              )
            }
          >
            {error}
          </Alerta>
        )}
        <Boton type="submit" cargando={enviando}>
          Entrar
        </Boton>
      </form>
    </TarjetaCuenta>
  );
}
