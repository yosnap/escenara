"use client";

import { SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aviso } from "@/components/ui/feedback";
import { Selector } from "@/components/ui/select";
import { SelectorTema } from "@/components/ui/theme-toggle";
import { authCliente } from "@/lib/auth-cliente";
import { mensajeError } from "@/lib/errores-auth";
import { ETIQUETA_IDIOMA, IDIOMAS, type Idioma } from "@/lib/preferencias";
import { Bloque } from "./bloque";

export function Preferencias({ idioma }: { idioma: Idioma }) {
  const router = useRouter();
  const [valor, setValor] = useState<Idioma>(idioma);
  const [error, setError] = useState<string | null>(null);
  return (
    <Bloque
      titulo="Preferencias"
      descripcion="Se guardan en tu cuenta y te siguen en todos tus dispositivos."
      icono={<SlidersHorizontal />}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-texto">Tema</span>
          <SelectorTema />
        </div>
        <div className="flex flex-col gap-1.5">
          <Selector
            etiqueta="Idioma"
            opciones={IDIOMAS.map((i) => ({ value: i, label: ETIQUETA_IDIOMA[i] }))}
            valor={valor}
            onCambio={async (v) => {
              if (v !== "es" && v !== "en") return;
              setValor(v);
              setError(null);
              const r = await authCliente.updateUser({ idioma: v });
              if (r.error) {
                setValor(idioma);
                return setError(mensajeError(r.error));
              }
              router.refresh();
            }}
          />
          <p className="text-sm text-texto-suave">
            De momento la interfaz está en español; la traducción llegará pronto.
          </p>
          {error && <Aviso tono="error">{error}</Aviso>}
        </div>
      </div>
    </Bloque>
  );
}
