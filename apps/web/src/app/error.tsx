"use client";

import { PantallaDeError } from "@/components/ui/limite-de-carga";

/** Cualquier pantalla que falle al pintarse: la causa, «Reintentar» y «Recargar», sin detalles técnicos. */
export default function ErrorDePantalla(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main id="contenido" tabIndex={-1} className="min-h-dvh bg-fondo">
      <PantallaDeError {...props} />
    </main>
  );
}
