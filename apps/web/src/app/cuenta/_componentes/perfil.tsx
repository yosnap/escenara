"use client";

import { BadgeCheck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { authCliente } from "@/lib/auth-cliente";
import { mensajeError } from "@/lib/errores-auth";
import { Bloque } from "./bloque";

export function Perfil({ nombre, email, verificado }: { nombre: string; email: string; verificado: boolean }) {
  const router = useRouter();
  const [valor, setValor] = useState(nombre);
  const [estado, setEstado] = useState<"inicio" | "guardando" | "guardado">("inicio");
  const [error, setError] = useState<string | null>(null);

  const guardar = async (evento: FormEvent) => {
    evento.preventDefault();
    setEstado("guardando");
    setError(null);
    const { error } = await authCliente.updateUser({ name: valor.trim() });
    if (error) {
      setEstado("inicio");
      return setError(mensajeError(error));
    }
    setEstado("guardado");
    router.refresh();
  };

  return (
    <Bloque titulo="Perfil" icono={<UserRound />}>
      <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre">
          {(p) => (
            <EntradaTexto
              {...p}
              autoComplete="name"
              required
              maxLength={80}
              value={valor}
              onChange={(e) => {
                setValor(e.target.value);
                setEstado("inicio");
              }}
            />
          )}
        </Campo>
        <Campo
          etiqueta="Correo"
          ayuda={
            verificado ? (
              <span className="inline-flex items-center gap-1 text-correcto">
                <BadgeCheck className="size-4" aria-hidden /> Confirmado
              </span>
            ) : (
              "Pendiente de confirmar"
            )
          }
        >
          {(p) => <EntradaTexto {...p} type="email" value={email} readOnly />}
        </Campo>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Boton type="submit" cargando={estado === "guardando"} disabled={valor.trim() === nombre}>
            Guardar
          </Boton>
          {estado === "guardado" && <Aviso tono="correcto">Guardado</Aviso>}
          {error && <Aviso tono="error">{error}</Aviso>}
        </div>
      </form>
    </Bloque>
  );
}
