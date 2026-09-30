"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Boton } from "@/components/ui/button";
import { TarjetaCuenta } from "@/components/ui/cuenta";
import { Aviso } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { authCliente } from "@/lib/auth-cliente";
import { mensajeError } from "@/lib/errores-auth";

/** «Revisa tu correo», con opción de reenviar el enlace de confirmación. */
export function ReenviarVerificacion({ emailInicial }: { emailInicial: string }) {
  const [email, setEmail] = useState(emailInicial);
  const [estado, setEstado] = useState<"inicio" | "enviando" | "enviado">("inicio");
  const [error, setError] = useState<string | null>(null);

  const reenviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setEstado("enviando");
    setError(null);
    const { error } = await authCliente.sendVerificationEmail({ email, callbackURL: "/cuenta" });
    if (error) {
      setEstado("inicio");
      return setError(mensajeError(error));
    }
    setEstado("enviado");
  };

  return (
    <TarjetaCuenta
      titulo="Revisa tu correo"
      descripcion="Te hemos enviado un enlace para confirmar tu dirección. Ábrelo desde este mismo navegador para entrar directamente."
      pie={
        <Link href="/entrar" className="font-semibold text-acento underline-offset-4 hover:underline">
          Volver a entrar
        </Link>
      }
    >
      <div className="flex items-center gap-3 rounded-tarjeta bg-elevada p-4 text-texto">
        <MailCheck className="size-6 shrink-0 text-acento" aria-hidden />
        <p className="text-sm">
          ¿No lo encuentras? Mira en la carpeta de correo no deseado o pide uno nuevo. El enlace caduca en 24 horas.
        </p>
      </div>
      <form onSubmit={reenviar} className="flex flex-col gap-4">
        <Campo etiqueta="Correo">
          {(p) => (
            <EntradaTexto {...p} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          )}
        </Campo>
        {error && <Aviso tono="error">{error}</Aviso>}
        {estado === "enviado" && (
          <Aviso tono="correcto">Si la cuenta existe y está pendiente, te hemos enviado un enlace nuevo.</Aviso>
        )}
        <Boton type="submit" variante="secundario" cargando={estado === "enviando"}>
          Reenviar el enlace
        </Boton>
      </form>
    </TarjetaCuenta>
  );
}
