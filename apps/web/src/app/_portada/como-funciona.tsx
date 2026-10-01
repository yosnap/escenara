import { Camera, Clapperboard, UserRoundCheck } from "lucide-react";
import type { ReactNode } from "react";

const PASOS: { icono: ReactNode; titulo: string; texto: string; color: string; borde: string }[] = [
  {
    icono: <Camera />,
    titulo: "Sube fotos autorizadas",
    texto:
      "Tus fotos o las de alguien que te ha dado permiso, o las de tu mascota. Escenara te guía para que sean nítidas.",
    color: "bg-v-cian/15 text-v-cian",
    borde: "border-v-cian/40",
  },
  {
    icono: <UserRoundCheck />,
    titulo: "Aprueba tu personaje",
    texto: "Primero ves una imagen fija de prueba, que cuesta céntimos. Solo si te convence, pasas al vídeo.",
    color: "bg-v-coral/15 text-v-coral",
    borde: "border-v-coral/40",
  },
  {
    icono: <Clapperboard />,
    titulo: "Crea escena a escena",
    texto: "Elige una plantilla, revisa cada escena y monta tu reel. Nada se genera sin que lo apruebes.",
    color: "bg-v-cobalto/15 text-v-cobalto",
    borde: "border-v-cobalto/40",
  },
];

export function ComoFunciona() {
  return (
    <section
      id="como-funciona"
      aria-labelledby="titulo-como"
      className="relative scroll-mt-20 overflow-hidden bg-superficie py-20 lg:scroll-mt-40"
    >
      <div aria-hidden className="absolute -top-40 right-0 size-96 rounded-full bg-v-cian/15 blur-3xl" />
      <div aria-hidden className="absolute -bottom-40 left-0 size-96 rounded-full bg-v-coral/15 blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-5 md:px-8">
        <p className="text-sm font-bold tracking-widest text-creativo uppercase">Cómo funciona</p>
        <h2 id="titulo-como" className="mt-2 text-4xl font-bold text-texto md:text-5xl">
          De tus fotos a tu reel en tres pasos
        </h2>
        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {PASOS.map((p, i) => (
            <li
              key={p.titulo}
              className={`relative flex flex-col gap-4 overflow-hidden rounded-tarjeta border-2 bg-fondo p-6 transition-transform duration-(--motion-base) hover:-translate-y-1 ${p.borde}`}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -top-2 right-2 bg-degradado-escenario bg-clip-text text-[6rem] leading-none font-bold text-transparent opacity-25"
              >
                {i + 1}
              </span>
              <div className="flex items-center gap-3">
                <span
                  className={`flex size-12 items-center justify-center rounded-full [&>svg]:size-6 ${p.color}`}
                  aria-hidden
                >
                  {p.icono}
                </span>
                <span className="font-mono text-sm font-bold text-texto-suave">Paso {i + 1}</span>
              </div>
              <h3 className="text-xl font-bold text-texto">{p.titulo}</h3>
              <p className="text-texto-suave">{p.texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
