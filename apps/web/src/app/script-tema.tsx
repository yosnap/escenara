"use client";

import { SCRIPT_TEMA } from "@/lib/tema";

/**
 * Script que aplica el tema guardado antes de pintar. Solo tiene sentido en el HTML del servidor: el navegador lo
 * ejecuta al leerlo y ya no hace falta más.
 *
 * Si React vuelve a crear la raíz en el cliente (una extensión que toca el HTML antes de hidratar, un desajuste,
 * un 404), crearía de nuevo el `<script>` y avisaría de que no se ejecuta. En el cliente sale como **bloque de
 * datos** (`application/json`): React no lo ejecuta ni avisa, y la diferencia de `type` con el HTML del servidor
 * es a propósito, por eso se suprime el aviso de hidratación de este elemento.
 */
export function ScriptTema() {
  return (
    <script
      suppressHydrationWarning
      type={typeof window === "undefined" ? undefined : "application/json"}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: script estático propio para aplicar el tema antes de pintar
      dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }}
    />
  );
}
