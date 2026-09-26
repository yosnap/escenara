import { Repeat2 } from "lucide-react";
import { Pegatina, TarjetaReel } from "@/components/ui/creator";
import { MascotaChispa } from "@/components/ui/mascota";
import { EJEMPLOS, imagenEjemplo, videoEjemplo } from "@/lib/escaparate";

/** Escaparate de personajes ficticios. Todo el contenido está etiquetado como generado con IA. */
export function Escaparate() {
  return (
    <section id="escaparate" aria-labelledby="titulo-escaparate" className="scroll-mt-20 py-20">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <p className="text-sm font-bold tracking-widest text-creativo uppercase">Escaparate</p>
        <h2 id="titulo-escaparate" className="mt-2 text-4xl font-bold text-texto md:text-5xl">
          Personajes que repiten escena
        </h2>
        <p className="mt-3 max-w-2xl text-lg text-texto-suave">
          Personas y mascotas inventadas, creadas con Escenara. Fíjate en Lucía: es la misma en el mirador y en el
          mercado.
        </p>
      </div>
      {/* En móvil es un carrusel con scroll horizontal: enfocable para poder moverlo con el teclado. */}
      <ul
        // biome-ignore lint/a11y/noNoninteractiveTabindex: contenedor con scroll que debe poder recorrerse con teclado
        tabIndex={0}
        aria-label="Ejemplos de personajes"
        className="mx-auto mt-10 flex max-w-6xl snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-6 md:grid md:grid-cols-4 md:overflow-visible md:px-8"
      >
        {EJEMPLOS.map((e) => (
          <li key={e.id} className="shrink-0 snap-start">
            <TarjetaReel
              titulo={e.titulo}
              subtitulo={`${e.personaje} · ${e.especialidad}`}
              imagen={imagenEjemplo(e.id)}
              video={e.video ? videoEjemplo(e.id) : undefined}
              duracion={e.duracion}
              alt={e.alt}
              tono={e.tono}
              ancho="w-56 md:w-full"
              pegatina={
                e.mismoPersonajeQue ? (
                  <Pegatina tono="fucsia">
                    <Repeat2 className="size-3.5" aria-hidden /> Mismo personaje · IA
                  </Pegatina>
                ) : (
                  <Pegatina tono="cobalto">Generado con IA</Pegatina>
                )
              }
            />
          </li>
        ))}
        <li className="shrink-0 snap-start">
          {/* Texto sobre degradado: solo grande y con velo oscuro, como pide la guía de marca. */}
          <div className="relative flex aspect-9/16 w-56 flex-col items-center justify-center gap-4 overflow-hidden rounded-tarjeta bg-degradado-escenario p-6 text-center shadow-md md:w-full">
            <div aria-hidden className="absolute inset-0 bg-black/45" />
            <MascotaChispa expresion="celebra" tamano={96} className="relative" />
            <p className="relative text-2xl leading-tight font-bold text-white">Aquí irá tu personaje</p>
            <p className="relative text-xl font-bold text-white">Muy pronto podrás crear el tuyo</p>
          </div>
        </li>
      </ul>
      <p className="mx-auto max-w-6xl px-5 text-sm text-texto-suave md:px-8">
        Todas las imágenes y vídeos de esta página son sintéticos: personajes ficticios generados con IA a partir de
        texto, sin fotos de personas reales.
      </p>
    </section>
  );
}
