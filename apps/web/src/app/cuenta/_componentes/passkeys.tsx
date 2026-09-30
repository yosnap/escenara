"use client";

import { Fingerprint, KeyRound, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Boton, BotonIcono } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { authCliente } from "@/lib/auth-cliente";
import { mensajeError } from "@/lib/errores-auth";
import { Bloque } from "./bloque";

export interface PasskeyVista {
  id: string;
  nombre: string;
  creada: string | null;
}

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "";

export function Passkeys({ passkeys }: { passkeys: PasskeyVista[] }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const anadir = async (evento: FormEvent) => {
    evento.preventDefault();
    setOcupado("nueva");
    setError(null);
    const r = await authCliente.passkey.addPasskey({ name: nombre.trim() || "Passkey" });
    setOcupado(null);
    if (r?.error) return setError(mensajeError(r.error));
    setNombre("");
    router.refresh();
  };

  const borrar = async (id: string) => {
    setOcupado(id);
    setError(null);
    const { error } = await authCliente.passkey.deletePasskey({ id });
    setOcupado(null);
    if (error) return setError(mensajeError(error));
    router.refresh();
  };

  return (
    <Bloque
      titulo="Passkeys"
      descripcion="Entra con la huella, la cara o el PIN de tu dispositivo, sin escribir la contraseña."
      icono={<Fingerprint />}
    >
      {passkeys.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-control border border-borde/60 px-4 py-2">
              <KeyRound className="size-4 shrink-0 text-acento" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-texto">{p.nombre}</span>
                {p.creada && <span className="text-sm text-texto-suave">Añadida el {fecha(p.creada)}</span>}
              </span>
              <BotonIcono etiqueta={`Quitar ${p.nombre}`} onClick={() => borrar(p.id)} disabled={ocupado !== null}>
                <Trash2 className="size-4" />
              </BotonIcono>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-texto-suave">Aún no has añadido ninguna passkey.</p>
      )}
      <form onSubmit={anadir} className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Campo etiqueta="Nombre de la passkey" ayuda="Para reconocerla, por ejemplo «Portátil» o «Móvil».">
            {(p) => <EntradaTexto {...p} maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} />}
          </Campo>
        </div>
        <Boton type="submit" variante="secundario" cargando={ocupado === "nueva"} disabled={ocupado !== null}>
          Añadir passkey
        </Boton>
      </form>
      {error && <Aviso tono="error">{error}</Aviso>}
    </Bloque>
  );
}
