"use client";

import { PantallaDeError } from "@/components/ui/limite-de-carga";

/** El montaje: si falla al pintarse, la causa y cómo seguir. Lo guardado del montaje no se toca. */
export default function ErrorDeMontaje(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main id="contenido" tabIndex={-1} className="min-h-dvh bg-fondo">
      <PantallaDeError {...props} />
    </main>
  );
}
