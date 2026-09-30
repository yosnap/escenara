"use client";

import { PantallaDeError } from "@/components/ui/limite-de-carga";

/** «Crear» y su historial: si fallan al pintarse, la causa y cómo seguir. Desde aquí no se envía ningún trabajo. */
export default function ErrorDeCrear(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main id="contenido" tabIndex={-1} className="min-h-dvh bg-fondo">
      <PantallaDeError {...props} />
    </main>
  );
}
