/**
 * La **chispa** del logotipo y el cargador que la usa. Sin JavaScript de movimiento a propósito: el cargador sale en
 * el selector de medios, que está en casi todas las pantallas, y con la librería de animación cada una de ellas
 * cargaba 41 KB comprimidos solo para girar un icono. El giro es CSS y solo corre si la persona no ha pedido reducir
 * el movimiento (`motion-safe:`); con «reducir movimiento» la chispa se queda quieta.
 */

/** Estrella de cuatro puntas del logotipo (la «chispa»). */
export function IconoChispa({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 90 96" aria-hidden className={className}>
      <path d="M45 32C47 41 51 45 59 48C51 51 47 55 45 64C43 55 39 51 31 48C39 45 43 41 45 32Z" fill="currentColor" />
    </svg>
  );
}

/** Cargador con la chispa del logo. Con movimiento reducido, queda estática. */
export function CargadorChispa({ etiqueta = "Cargando" }: { etiqueta?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-texto-suave">
      <span className="text-chispa motion-safe:animate-[giro-chispa_1.2s_ease-in-out_infinite]">
        <IconoChispa className="size-8" />
      </span>
      <span>{etiqueta}</span>
    </span>
  );
}
