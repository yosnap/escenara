import { Muestra, Seccion } from "../seccion";

const SEMANTICOS = [
  ["bg-fondo", "Fondo"],
  ["bg-superficie", "Superficie"],
  ["bg-elevada", "Elevada"],
  ["bg-acento", "Acento"],
  ["bg-chispa", "Chispa"],
  ["bg-creativo", "Creativo"],
  ["bg-correcto", "Correcto"],
  ["bg-aviso", "Aviso"],
  ["bg-error", "Error"],
];
const VIBRANTES = [
  ["bg-v-cobalto", "Cobalto"],
  ["bg-v-coral", "Coral"],
  ["bg-v-mandarina", "Mandarina"],
  ["bg-v-sol", "Sol"],
  ["bg-v-fucsia", "Fucsia"],
  ["bg-v-cian", "Cian"],
];
const DEGRADADOS = [
  ["bg-degradado-foco", "Foco"],
  ["bg-degradado-chispa", "Chispa"],
  ["bg-degradado-escenario", "Escenario"],
  ["bg-degradado-atardecer", "Atardecer"],
];

function Muestras({ lista, alto = "h-16" }: { lista: string[][]; alto?: string }) {
  return (
    <>
      {lista.map(([clase, nombre]) => (
        <div key={nombre} className="flex w-28 flex-col gap-1.5">
          <div className={`${alto} rounded-control border border-borde/40 ${clase}`} />
          <span className="text-sm font-medium text-texto">{nombre}</span>
        </div>
      ))}
    </>
  );
}

export function SeccionTokens() {
  return (
    <Seccion
      id="tokens"
      titulo="Colores y tipografía"
      descripcion="Tokens de la marca 0.5.0 generados desde escenara.brand.json. Cambian solos con el tema."
    >
      <div className="grid gap-4">
        <Muestra titulo="Semánticos (texto y estados)">
          <Muestras lista={SEMANTICOS} />
        </Muestra>
        <Muestra titulo="Vibrantes (decoración, categorías, celebraciones)">
          <Muestras lista={VIBRANTES} />
        </Muestra>
        <Muestra titulo="Degradados">
          <Muestras lista={DEGRADADOS} alto="h-24" />
        </Muestra>
        <Muestra titulo="Escala tipográfica · Manrope">
          <div className="flex flex-col gap-2 text-texto">
            <p className="text-5xl font-bold tracking-tight">Display · Da vida a cada escena</p>
            <p className="text-4xl font-bold">H1 · Crea personajes</p>
            <p className="text-3xl font-semibold">H2 · Dirige historias</p>
            <p className="text-2xl font-semibold">H3 · Preparar escena</p>
            <p className="text-base">Cuerpo · Falta una foto lateral para mantener mejor el perfil del personaje.</p>
            <p className="font-mono text-sm text-texto-suave">Mono · 0,42 € por escena · job_7f3a</p>
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
