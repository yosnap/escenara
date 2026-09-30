"use client";

import { PantallaDeError } from "@/components/ui/limite-de-carga";

/** Los proyectos (lista, guion, producción, revisión y voz): si fallan al pintarse, la causa y cómo seguir. */
export default function ErrorDeProyectos(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main id="contenido" tabIndex={-1} className="min-h-dvh bg-fondo">
      <PantallaDeError {...props} />
    </main>
  );
}
