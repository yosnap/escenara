"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Boton } from "@/components/ui/button";
import type { Proveedor } from "@/components/ui/cuenta";
import { TarjetaCuenta } from "@/components/ui/cuenta";
import { EntradaContrasena } from "@/components/ui/entrada-contrasena";
import { Aviso } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { authCliente } from "@/lib/auth-cliente";
import { mensajeError } from "@/lib/errores-auth";
import { AccesoExterno } from "./acceso-externo";

const enlaceEntrar = (
  <>
    ¿Ya tienes cuenta?{" "}
    <Link href="/entrar" className="font-semibold text-acento underline-offset-4 hover:underline">
      Entra
    </Link>
  </>
);

export function FormularioRegistro({
  proveedores,
  registroAbierto,
}: {
  proveedores: Proveedor[];
  registroAbierto: boolean;
}) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!registroAbierto) {
    return (
      <TarjetaCuenta titulo="Registro cerrado" pie={enlaceEntrar}>
        <Aviso tono="info">
          Esta instalación de Escenara no admite cuentas nuevas. Pide acceso a quien la administra.
        </Aviso>
      </TarjetaCuenta>
    );
  }

  const registrar = async (evento: FormEvent) => {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    const { error } = await authCliente.signUp.email({ name: nombre, email, password: clave, callbackURL: "/cuenta" });
    setEnviando(false);
    if (error) return setError(mensajeError(error));
    window.location.assign(`/verificar?email=${encodeURIComponent(email)}`);
  };

  return (
    <TarjetaCuenta
      titulo="Crea tu cuenta"
      descripcion="En unos minutos tendrás tu estudio listo para crear personajes."
      pie={enlaceEntrar}
    >
      <AccesoExterno proveedores={proveedores} volver="/cuenta" conPasskey={false} onError={setError} />
      <form onSubmit={registrar} className="flex flex-col gap-4">
        <Campo etiqueta="Nombre">
          {(p) => (
            <EntradaTexto
              {...p}
              autoComplete="name"
              required
              maxLength={80}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          )}
        </Campo>
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
        <Campo etiqueta="Contraseña" ayuda="Al menos 10 caracteres. Una frase larga es más segura y fácil de recordar.">
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
        {error && (
          <p role="alert" className="text-sm font-medium text-error">
            {error}
          </p>
        )}
        <Boton type="submit" variante="chispa" cargando={enviando}>
          Crear cuenta
        </Boton>
        <p className="text-xs text-texto-suave">Te enviaremos un correo para confirmar la dirección antes de entrar.</p>
      </form>
    </TarjetaCuenta>
  );
}
