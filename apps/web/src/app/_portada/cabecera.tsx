import { ArrowDown, Sparkles } from "lucide-react";
import { claseBoton } from "@/components/ui/button";
import { IconoChispa } from "@/components/ui/chispa";
import { Pegatina, TarjetaReel } from "@/components/ui/creator";
import { MascotaChispa } from "@/components/ui/mascota";
import { type CapaParallax, EscenaParallax } from "@/components/ui/parallax";
import { imagenEjemplo } from "@/lib/escaparate";

const CHISPAS = [
  { x: "8%", y: "18%", tam: "size-6", color: "text-v-sol" },
  { x: "46%", y: "10%", tam: "size-4", color: "text-v-fucsia" },
  { x: "88%", y: "14%", tam: "size-5", color: "text-v-cian" },
  { x: "4%", y: "72%", tam: "size-4", color: "text-v-coral" },
  { x: "56%", y: "86%", tam: "size-6", color: "text-v-mandarina" },
];

const CAPAS: CapaParallax[] = [
  {
    id: "fondo",
    velocidad: 160,
    className: "inset-0",
    contenido: (
      <>
        <div className="absolute -top-32 -left-24 size-[28rem] rounded-full bg-v-cobalto/25 blur-3xl" />
        <div className="absolute top-10 right-[-6rem] size-[26rem] rounded-full bg-v-fucsia/20 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-1/3 size-[24rem] rounded-full bg-v-sol/25 blur-3xl" />
      </>
    ),
  },
  {
    id: "marco",
    velocidad: -60,
    className: "inset-6 md:inset-12",
    contenido: (
      <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="size-full text-acento/25">
        <path
          d="M2 18V2H18M82 2H98V18M98 82V98H82M18 98H2V82"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    ),
  },
  {
    id: "chispas",
    velocidad: -220,
    className: "inset-0",
    contenido: CHISPAS.map((c) => (
      <span key={`${c.x}-${c.y}`} className={`absolute ${c.color}`} style={{ left: c.x, top: c.y }}>
        <IconoChispa className={c.tam} />
      </span>
    )),
  },
];

/** Cabecera con parallax por capas: la «capa Escenario» de la marca. */
export function CabeceraPortada() {
  return (
    <EscenaParallax capas={CAPAS} className="bg-[color-mix(in_srgb,var(--background)_98%,var(--text))]">
      <section
        id="inicio"
        aria-labelledby="titulo-portada"
        className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-[1.1fr_1fr] md:px-8"
      >
        <div className="flex flex-col items-start gap-6">
          <Pegatina tono="cobalto">Código abierto · Trae tu propia clave</Pegatina>
          <h1 id="titulo-portada" className="text-5xl leading-[1.05] font-bold tracking-tight text-texto md:text-7xl">
            Da vida a <span className="bg-degradado-titular bg-clip-text text-transparent">cada escena</span>
          </h1>
          <p className="max-w-xl text-lg text-texto-suave md:text-xl">
            Crea personajes que se mantienen de una escena a otra, a partir de fotos autorizadas, y produce reels paso a
            paso: tú apruebas cada escena y ves cuánto cuesta antes de generarla.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="#escaparate" className={claseBoton("chispa", "lg")}>
              <Sparkles className="size-5" aria-hidden /> Ver ejemplos
            </a>
            <a href="#como-funciona" className={claseBoton("secundario", "lg")}>
              Cómo funciona <ArrowDown className="size-5" aria-hidden />
            </a>
          </div>
          <div className="flex items-center gap-3">
            <MascotaChispa expresion="saluda" tamano={64} />
            <p className="relative rounded-tarjeta border border-borde bg-superficie px-4 py-2 text-sm font-semibold text-texto shadow-sm">
              ¡Hola! Soy Chispa. Te acompaño mientras creas.
            </p>
          </div>
        </div>

        <div aria-hidden className="relative hidden h-[34rem] md:block">
          <div className="absolute top-0 left-4 rotate-[-6deg]">
            <TarjetaReel
              titulo="Lucía"
              subtitulo="Turismo y viajes"
              imagen={imagenEjemplo("lucia")}
              tono="cian"
              ancho="w-52"
            />
          </div>
          <div className="absolute top-24 right-2 z-10 rotate-[5deg]">
            <TarjetaReel titulo="Nube" subtitulo="Mascotas" imagen={imagenEjemplo("nube")} tono="sol" ancho="w-56" />
          </div>
          <div className="absolute bottom-0 left-20 rotate-[2deg]">
            <TarjetaReel
              titulo="Marco"
              subtitulo="Gastronomía"
              imagen={imagenEjemplo("marco")}
              tono="mandarina"
              ancho="w-48"
            />
          </div>
        </div>
      </section>
    </EscenaParallax>
  );
}
