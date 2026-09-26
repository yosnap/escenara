import { Code2, KeyRound, ShieldCheck, Wallet } from "lucide-react";
import type { ReactNode } from "react";

const PUNTOS: { icono: ReactNode; titulo: string; texto: string }[] = [
  {
    icono: <KeyRound />,
    titulo: "Tu propia clave",
    texto:
      "Conectas tu cuenta del proveedor de IA. Pagas directamente lo que generas, sin intermediarios ni suscripción.",
  },
  {
    icono: <Wallet />,
    titulo: "Gasto bajo control",
    texto:
      "Antes de generar ves una estimación del coste y un tope que no se supera. El importe final depende del proveedor.",
  },
  {
    icono: <ShieldCheck />,
    titulo: "Consentimiento primero",
    texto: "Solo se usan fotos de personas que lo han autorizado, y todo el contenido generado se etiqueta como IA.",
  },
  {
    icono: <Code2 />,
    titulo: "Código abierto",
    texto: "Licencia AGPL 3.0: puedes revisar el código, instalarlo en tu servidor y mejorarlo con la comunidad.",
  },
];

/** Zona de claridad: sin parallax ni degradados, contraste AA y textos precisos. */
export function Confianza() {
  return (
    <section id="confianza" aria-labelledby="titulo-confianza" className="scroll-mt-20 py-20">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <p className="text-sm font-bold tracking-widest text-creativo uppercase">Confianza</p>
        <h2 id="titulo-confianza" className="mt-2 text-4xl font-bold text-texto md:text-5xl">
          Creativo, pero con los pies en el suelo
        </h2>
        <ul className="mt-10 grid gap-5 sm:grid-cols-2">
          {PUNTOS.map((p) => (
            <li key={p.titulo} className="flex gap-4 rounded-tarjeta border border-borde bg-superficie p-6">
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-acento/12 text-acento [&>svg]:size-5"
                aria-hidden
              >
                {p.icono}
              </span>
              <div>
                <h3 className="text-lg font-bold text-texto">{p.titulo}</h3>
                <p className="mt-1 text-texto-suave">{p.texto}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
