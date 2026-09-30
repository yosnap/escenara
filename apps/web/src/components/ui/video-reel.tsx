"use client";

import { Pause, Play } from "lucide-react";
import { useCallback, useRef, useState } from "react";

function movimientoPermitido() {
  const conexion = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !matchMedia("(prefers-reduced-motion: reduce)").matches && !conexion?.saveData;
}

/**
 * Vídeo corto en bucle y sin sonido para tarjetas 9:16. Se reproduce solo mientras está en pantalla y la
 * pestaña está visible, nunca con movimiento reducido o ahorro de datos (comprobado en cada cambio), y
 * siempre tiene un botón para pausarlo o reproducirlo (WCAG 2.2.2). Una pausa manual se respeta. El cartel se carga
 * en diferido, como cualquier imagen de la página.
 */
export function VideoReel({ src, poster, alt }: { src: string; poster?: string; alt?: string }) {
  const [reproduciendo, setReproduciendo] = useState(false);
  const video = useRef<HTMLVideoElement | null>(null);
  const pausaManual = useRef(false);

  const enganchar = useCallback((el: HTMLVideoElement | null) => {
    video.current = el;
    if (!el) return;
    let visible = false;
    const actualizar = () => {
      if (visible && !document.hidden && !pausaManual.current && movimientoPermitido()) {
        el.preload = "auto";
        void el.play().catch(() => undefined);
      } else el.pause();
    };
    const observador = new IntersectionObserver(
      ([entrada]) => {
        visible = entrada?.isIntersecting ?? false;
        actualizar();
      },
      { threshold: 0.5 },
    );
    const preferencia = matchMedia("(prefers-reduced-motion: reduce)");
    observador.observe(el);
    document.addEventListener("visibilitychange", actualizar);
    preferencia.addEventListener("change", actualizar);
    return () => {
      observador.disconnect();
      document.removeEventListener("visibilitychange", actualizar);
      preferencia.removeEventListener("change", actualizar);
    };
  }, []);

  const alternar = () => {
    const el = video.current;
    if (!el) return;
    if (el.paused) {
      pausaManual.current = false;
      void el.play().catch(() => undefined);
    } else {
      pausaManual.current = true;
      el.pause();
    }
  };

  return (
    <>
      {/* El cartel va como imagen en diferido y no como `poster`: el atributo se descarga siempre, al abrir la página,
          aunque la tarjeta esté lejos. Sin cartel y sin precarga, el vídeo es transparente hasta que se reproduce. */}
      {poster && (
        // biome-ignore lint/performance/noImgElement: cartel estático ya optimizado (WebP a su tamaño) que se carga en diferido
        <img
          src={poster}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      )}
      <video
        ref={enganchar}
        src={src}
        muted
        loop
        playsInline
        preload="none"
        aria-label={alt || undefined}
        onPlay={() => setReproduciendo(true)}
        onPause={() => setReproduciendo(false)}
        className="absolute inset-0 size-full object-cover"
      />
      <button
        type="button"
        onClick={alternar}
        aria-label={reproduciendo ? "Pausar vídeo" : "Reproducir vídeo"}
        title={reproduciendo ? "Pausar vídeo" : "Reproducir vídeo"}
        className="absolute right-2 bottom-14 z-10 flex size-11 items-center justify-center rounded-full bg-black/55 text-white transition-colors duration-(--motion-fast) hover:bg-black/75"
      >
        {reproduciendo ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>
    </>
  );
}
