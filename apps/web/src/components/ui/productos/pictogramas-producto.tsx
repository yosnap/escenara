import type { ReactNode } from "react";
import { cn } from "../cn";

/**
 * **Pictogramas de las acciones de producto** (0.26.0), con la misma receta que los de la dirección (0.25.1):
 * un esquema por acción y **una frase llana** al lado de lo que verá el espectador.
 *
 * Por qué existen: «enseñarlo a cámara» y «mostrarlo» suenan igual y no lo son —uno gira la etiqueta hacia el
 * objetivo y el otro solo lo tiene en la mano—, y esa diferencia es justo la que decide si la etiqueta se lee.
 * El dibujo la enseña en un segundo.
 *
 * Cómo están hechos, igual que los de la dirección:
 *
 * - SVG en línea, sin ningún archivo ni fuente de iconos que cargar;
 * - **solo `currentColor`**: heredan el color del tema y se leen igual en claro y en oscuro. La figura va con la
 *   opacidad bajada y el producto, a color pleno, que es lo que se mira;
 * - `aria-hidden`: la acción ya se nombra con su texto.
 *
 * Una clave que el código no conozca —quien administra puede añadir acciones al catálogo— enseña el pictograma
 * **genérico**, que es honesto, y nunca rompe la pantalla.
 */

function Marco({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 44"
      aria-hidden
      focusable="false"
      className={cn("h-11 w-16 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** La figura humana de referencia. Va apagada: lo que se mira es el producto. */
const Figura = ({ x = 22, y = 12 }: { x?: number; y?: number }) => (
  <g className="opacity-40" transform={`translate(${x} ${y})`}>
    <circle cx="0" cy="0" r="5" />
    <path d="M -8 22 C -8 11 -4 7 0 7 C 4 7 8 11 8 22" />
  </g>
);

/** El producto: un bote con su tapón y su etiqueta. Es la única figura a color pleno. */
const Bote = ({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) => (
  <g className="text-acento" transform={`translate(${x} ${y}) rotate(${rot})`}>
    <rect x="-5" y="-9" width="10" height="18" rx="2" />
    <path d="M -2.5 -9 v -3 h 5 v 3" />
    <path d="M -5 -2 h 10" strokeDasharray="2 1.5" />
  </g>
);

const Brazo = ({ d }: { d: string }) => <path d={d} className="opacity-40" />;

const Suelo = () => <path d="M 6 38 H 58" className="opacity-25" strokeDasharray="2 3" />;

const ACCIONES: Record<string, { dibujo: ReactNode; frase: string }> = {
  sostenerlo: {
    dibujo: (
      <>
        <Suelo />
        <Figura />
        <Brazo d="M 29 26 L 40 24" />
        <Bote x={44} y={23} />
      </>
    ),
    frase: "Lo tiene en la mano, a la vista, sin taparlo con los dedos.",
  },
  mirarlo: {
    dibujo: (
      <>
        <Suelo />
        <Figura />
        <Brazo d="M 29 26 L 40 26" />
        <Bote x={44} y={25} />
        {/* La mirada: lo que separa «mirarlo» de «sostenerlo» es adónde va la cara. */}
        <path d="M 27 12 L 41 20" className="text-acento opacity-70" strokeDasharray="2 2" />
      </>
    ),
    frase: "Lo mira mientras lo tiene delante, como quien lo está descubriendo.",
  },
  senalarlo: {
    dibujo: (
      <>
        <Suelo />
        <Figura />
        <Brazo d="M 29 24 L 38 22" />
        <path d="M 38 22 L 43 22" className="text-acento" />
        <Bote x={50} y={22} />
      </>
    ),
    frase: "Lo señala con el dedo para que te fijes en él.",
  },
  "ensenarlo-a-camara": {
    dibujo: (
      <>
        <Suelo />
        <Figura x={20} />
        <Brazo d="M 27 26 L 36 28" />
        {/* El bote grande y de frente: es lo que ocupa el plano cuando se enseña a cámara. */}
        <g className="text-acento" transform="translate(45 24) scale(1.35)">
          <rect x="-5" y="-9" width="10" height="18" rx="2" />
          <path d="M -2.5 -9 v -3 h 5 v 3" />
          <path d="M -3.5 -3 h 7 M -3.5 0 h 7 M -3.5 3 h 4" strokeWidth={1.1} />
        </g>
      </>
    ),
    frase: "Lo gira hacia la cámara con la etiqueta de frente, para que se lea.",
  },
  abrirlo: {
    dibujo: (
      <>
        <Suelo />
        <Figura />
        <Brazo d="M 29 26 L 39 26" />
        <Bote x={44} y={26} />
        {/* La tapa, saliendo: es la acción. */}
        <g className="text-acento">
          <rect x="41.5" y="9" width="5" height="3" rx="1" />
          <path d="M 44 17 L 44 14" markerEnd="url(#punta-producto)" />
        </g>
      </>
    ),
    frase: "Le quita la tapa o lo abre delante de la cámara.",
  },
  aplicarlo: {
    dibujo: (
      <>
        <Suelo />
        <Figura />
        <Brazo d="M 29 24 L 38 20" />
        <Bote x={42} y={18} rot={35} />
        {/* Lo que sale del bote y llega a la piel: sin esto, «aplicarlo» sería «sostenerlo» inclinado. */}
        <g className="text-acento">
          <path d="M 47 23 q 3 4 2 8" strokeDasharray="2 2" />
          <path d="M 44 33 h 10" />
        </g>
      </>
    ),
    frase: "Lo usa de verdad: se lo aplica, lo prueba o lo pone en marcha.",
  },
  "producto-solo": {
    dibujo: (
      <>
        <Suelo />
        {/* Sin figura: eso es exactamente lo que significa esta acción. */}
        <g transform="translate(32 22) scale(1.4)">
          <Bote x={0} y={0} />
        </g>
      </>
    ),
    frase: "El producto solo, sin nadie: un plano para intercalar en el montaje.",
  },
};

/** Lo que se enseña cuando quien administra ha añadido una acción que el código no conoce. */
const GENERICO = {
  dibujo: (
    <>
      <Suelo />
      <Figura />
      <Brazo d="M 29 26 L 40 24" />
      <Bote x={44} y={23} />
    </>
  ),
  frase: "",
};

/** La punta de flecha de estos pictogramas, definida una vez para todo el documento. */
export function DefinicionesPictogramaProducto() {
  return (
    <svg aria-hidden focusable="false" className="absolute size-0">
      <title>Definiciones de los pictogramas de producto</title>
      <defs>
        <marker id="punta-producto" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M 0 1 L 7 4 L 0 7 z" fill="currentColor" stroke="none" />
        </marker>
      </defs>
    </svg>
  );
}

/** La frase llana de una acción, o cadena vacía si es una que ha añadido quien administra. */
export const fraseDeAccionProducto = (clave: string): string => ACCIONES[clave]?.frase ?? "";

/** El pictograma de una acción del catálogo. Una clave desconocida devuelve el genérico. */
export function PictogramaProducto({ clave, className }: { clave: string; className?: string }) {
  const accion = ACCIONES[clave] ?? GENERICO;
  return <Marco className={className}>{accion.dibujo}</Marco>;
}

/** El pictograma de «sin producto»: el plano vacío, que es lo que se ve cuando no hay ninguno. */
export function PictogramaSinProducto({ className }: { className?: string }) {
  return (
    <Marco className={className}>
      <Suelo />
      <Figura x={32} />
    </Marco>
  );
}
