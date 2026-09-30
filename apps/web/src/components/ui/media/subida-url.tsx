"use client";

import { Link2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { TipoMedio } from "@/lib/media/reglas";
import type { Medio } from "@/lib/media/tipos";
import { Boton } from "../button";
import { Aviso } from "../feedback";
import { EntradaTexto } from "../field";
import { subirDesdeUrl } from "./api-medios";

/** Añade un medio a partir de la URL pública de un archivo; el servidor lo descarga y lo valida. */
export function SubidaUrl({ tipos, onSubido }: { tipos: readonly TipoMedio[]; onSubido: (medio: Medio) => void }) {
  const [url, setUrl] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    const r = await subirDesdeUrl(url, tipos);
    setEnviando(false);
    if (!r.ok) return setError(r.error);
    setUrl("");
    onSubido(r.datos);
  };

  return (
    <form onSubmit={enviar} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Link2 className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-texto-suave" />
          <EntradaTexto
            type="url"
            required
            aria-label="URL pública del archivo"
            aria-invalid={error ? true : undefined}
            placeholder="https://…/foto.jpg"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            className="pl-10"
          />
        </div>
        <Boton type="submit" variante="secundario" cargando={enviando}>
          Añadir desde URL
        </Boton>
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
    </form>
  );
}
