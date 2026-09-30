"use client";

import { PantallaDeError } from "@/components/ui/limite-de-carga";

/** La biblioteca: si falla al pintarse, la causa y cómo seguir. Tus archivos no se tocan. */
export default function ErrorDeBiblioteca(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main id="contenido" tabIndex={-1} className="min-h-dvh bg-fondo">
      <PantallaDeError {...props} />
    </main>
  );
}
