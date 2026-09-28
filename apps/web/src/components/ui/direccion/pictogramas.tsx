import type { ReactNode } from "react";
import { cn } from "../cn";

/**
 * **Pictogramas de la dirección** (0.25.1): un esquema por opción de plano, ángulo y movimiento de cámara, más
 * la línea de tiempo del gesto.
 *
 * Por qué existen: «tres cuartos», «contrapicado» o «push-in» son palabras de oficio, y quien no ha rodado nunca
 * no sabe qué va a ver. El dibujo dice dónde está la cámara respecto a la figura o por dónde se mueve, y al lado
 * va **una frase llana** de lo que verá el espectador. Las dos cosas juntas, siempre.
 *
 * Cómo están hechos:
 *
 * - SVG en línea, sin ningún archivo ni fuente de iconos que cargar;
 * - **solo `currentColor`**: heredan el color del tema, así que se leen igual en claro y en oscuro y no hay que
 *   mantener dos versiones. La figura va con la opacidad bajada y la cámara o la trayectoria, a color pleno,
 *   que es lo que hace que se lea de un vistazo cuál es la diferencia entre una opción y otra;
 * - `aria-hidden`: la opción ya se nombra con su texto. Un lector de pantalla no gana nada leyendo el dibujo.
 *
 * Qué pasa con una opción que no está aquí: quien administra puede añadir presets nuevos al catálogo, y no se
 * inventa un dibujo para ellos. Se enseña el pictograma **genérico**, que es honesto, y nunca se rompe la
 * pantalla por una clave desconocida.
 */

/** Marco común: mismo tamaño y mismo trazo en todos, que es lo que hace que la fila se lea como una sola cosa. */
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

/** La figura humana de referencia. Va apagada: lo que se mira es lo que la rodea. */
function Figura({ x = 32, y = 10, escala = 1 }: { x?: number; y?: number; escala?: number }) {
  return (
    <g className="opacity-40" transform={`translate(${x} ${y}) scale(${escala})`}>
      <circle cx="0" cy="0" r="5" />
      <path d="M -8 24 C -8 12 -4 7 0 7 C 4 7 8 12 8 24" />
    </g>
  );
}

/** La cámara: un cuerpo y su cono de visión. `rot` la gira alrededor de su propio punto. */
function Camara({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return (
    <g className="text-acento" transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect x="-5" y="-4" width="10" height="8" rx="1.5" />
      <path d="M 5 -4 L 12 -7 L 12 7 L 5 4 Z" />
    </g>
  );
}

/** El recuadro de encuadre: lo que entra en el plano. Es la única figura rellena, y por eso se ve primero. */
const Encuadre = ({ x, y, w, h }: { x: number; y: number; w: number; h: number }) => (
  <rect x={x} y={y} width={w} height={h} rx="2" className="text-acento" strokeDasharray="3 2" />
);

const Flecha = ({ d }: { d: string }) => (
  <g className="text-acento">
    <path d={d} markerEnd="url(#punta-direccion)" />
  </g>
);

/** La punta de flecha, definida una vez para todo el documento. */
export function DefinicionesPictograma() {
  return (
    <svg aria-hidden focusable="false" className="absolute size-0">
      <title>Definiciones de los pictogramas de dirección</title>
      <defs>
        <marker id="punta-direccion" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M 0 1 L 7 4 L 0 7 z" fill="currentColor" stroke="none" />
        </marker>
      </defs>
    </svg>
  );
}

/** Suelo: da el «abajo» del dibujo, que es lo que hace legible un picado o un contrapicado. */
const Suelo = () => <path d="M 6 38 H 58" className="opacity-25" strokeDasharray="2 3" />;

// ── Plano: cuánto cuerpo entra en el encuadre ───────────────────────────────────────────────────────────

const PLANOS: Record<string, { dibujo: ReactNode; frase: string }> = {
  general: {
    dibujo: (
      <>
        <Suelo />
        <Figura y={12} escala={0.85} />
        <Encuadre x={14} y={4} w={36} h={34} />
      </>
    ),
    frase: "Se le ve de cuerpo entero, con el sitio alrededor.",
  },
  americano: {
    dibujo: (
      <>
        <Suelo />
        <Figura y={12} escala={0.85} />
        <Encuadre x={14} y={4} w={36} h={26} />
      </>
    ),
    frase: "Se le ve de la cabeza a medio muslo.",
  },
  medio: {
    dibujo: (
      <>
        <Suelo />
        <Figura y={12} escala={0.85} />
        <Encuadre x={14} y={4} w={36} h={20} />
      </>
    ),
    frase: "Se le ve de cintura para arriba.",
  },
  "primer-plano": {
    dibujo: (
      <>
        <Figura y={14} escala={1.1} />
        <Encuadre x={16} y={4} w={32} h={22} />
      </>
    ),
    frase: "Se le ve la cara y los hombros: se le nota todo.",
  },
  primerisimo: {
    dibujo: (
      <>
        <Figura y={18} escala={1.5} />
        <Encuadre x={18} y={6} w={28} h={24} />
      </>
    ),
    frase: "Solo la cara, muy cerca: cada gesto se ve enorme.",
  },
};

// ── Ángulo: dónde está la cámara respecto a la figura ───────────────────────────────────────────────────

const mira = (d: string) => <path d={d} className="text-acento opacity-50" strokeDasharray="3 3" />;

const ANGULOS: Record<string, { dibujo: ReactNode; frase: string }> = {
  frente: {
    dibujo: (
      <>
        <Suelo />
        <Figura x={22} y={14} />
        <Camara x={52} y={18} rot={180} />
        {mira("M 40 18 H 30")}
      </>
    ),
    frase: "Te mira de frente, a la altura de los ojos.",
  },
  "tres-cuartos": {
    dibujo: (
      <>
        <Suelo />
        <Figura x={24} y={14} />
        <Camara x={50} y={30} rot={200} />
        {mira("M 40 27 L 30 21")}
      </>
    ),
    frase: "Se le ve medio girado: la cara gana volumen.",
  },
  perfil: {
    dibujo: (
      <>
        <Suelo />
        <Figura x={32} y={14} />
        <Camara x={54} y={34} rot={235} />
        {mira("M 46 30 L 38 24")}
        <path d="M 32 6 v 8" className="opacity-30" />
      </>
    ),
    frase: "Se le ve de lado, como de pasada.",
  },
  picado: {
    dibujo: (
      <>
        <Suelo />
        <Figura x={26} y={18} escala={0.85} />
        <Camara x={50} y={10} rot={155} />
        {mira("M 40 14 L 31 22")}
      </>
    ),
    frase: "La cámara mira desde arriba: se le ve más pequeño.",
  },
  contrapicado: {
    dibujo: (
      <>
        <Suelo />
        <Figura x={26} y={10} escala={0.9} />
        <Camara x={50} y={34} rot={205} />
        {mira("M 40 31 L 31 22")}
      </>
    ),
    frase: "La cámara mira desde abajo: se le ve más grande.",
  },
  cenital: {
    dibujo: (
      <>
        <Suelo />
        <Figura x={32} y={22} escala={0.8} />
        <Camara x={32} y={8} rot={90} />
        {mira("M 32 16 V 22")}
      </>
    ),
    frase: "Justo encima, mirando hacia abajo, como un plano desde el techo.",
  },
  holandes: {
    dibujo: (
      <>
        <Figura x={32} y={16} escala={0.9} />
        <g transform="rotate(12 32 22)">
          <Encuadre x={14} y={6} w={36} h={30} />
        </g>
      </>
    ),
    frase: "La imagen sale inclinada: da sensación de nervio.",
  },
  contraluz: {
    dibujo: (
      <>
        <Suelo />
        <circle cx="32" cy="10" r="5" className="text-acento" />
        <path d="M 32 2 v -0.5 M 24 10 h -3 M 40 10 h 3 M 26 5 l -2 -2 M 38 5 l 2 -2" className="text-acento" />
        <Figura x={32} y={20} escala={0.8} />
        <Camara x={32} y={40} rot={270} />
      </>
    ),
    frase: "La luz viene de detrás: se le recorta la silueta.",
  },
  "gran-angular": {
    dibujo: (
      <>
        <Suelo />
        <Figura x={32} y={14} escala={0.8} />
        <Camara x={52} y={22} rot={180} />
        {mira("M 40 22 L 18 8")}
        {mira("M 40 22 L 18 36")}
      </>
    ),
    frase: "Entra mucho sitio alrededor y lo cercano se agranda.",
  },
};

// ── Movimiento de cámara: por dónde va ──────────────────────────────────────────────────────────────────

const conFigura = (dibujo: ReactNode) => (
  <>
    <Suelo />
    <Figura y={14} escala={0.9} />
    {dibujo}
  </>
);

const MOVIMIENTOS: Record<string, { dibujo: ReactNode; frase: string }> = {
  "plano-fijo": {
    dibujo: conFigura(
      <>
        <Camara x={52} y={34} rot={200} />
        <path d="M 46 40 h 12" className="text-acento" />
      </>,
    ),
    frase: "La cámara no se mueve nada: como un trípode.",
  },
  "quieta-con-gestos": {
    dibujo: conFigura(
      <>
        <Camara x={52} y={34} rot={200} />
        <path d="M 46 40 h 12" className="text-acento" />
      </>,
    ),
    frase: "La cámara se queda quieta y lo que se mueve es él.",
  },
  "zoom-lento-cara": {
    dibujo: conFigura(<Flecha d="M 54 22 H 42" />),
    frase: "Se va acercando poco a poco hasta la cara.",
  },
  "zoom-rapido-inicio": {
    dibujo: conFigura(<Flecha d="M 58 22 H 42" />),
    frase: "Empieza lejos y se planta cerca de golpe.",
  },
  "push-in-ojos": {
    dibujo: conFigura(<Flecha d="M 54 22 H 41" />),
    frase: "Avanza hacia él hasta quedarse en los ojos.",
  },
  "acercamiento-sutil": {
    dibujo: conFigura(<Flecha d="M 54 22 H 46" />),
    frase: "Se acerca un poquito, casi sin que se note.",
  },
  "retroceso-revela": {
    dibujo: conFigura(<Flecha d="M 44 22 H 58" />),
    frase: "Se va hacia atrás y aparece lo que había alrededor.",
  },
  "orbita-lenta": {
    dibujo: conFigura(
      <>
        <path d="M 12 30 A 22 12 0 0 0 52 30" className="text-acento opacity-40" strokeDasharray="3 3" />
        <Flecha d="M 46 34 A 22 12 0 0 0 52 28" />
      </>,
    ),
    frase: "Da la vuelta alrededor de él mientras le graba.",
  },
  "seguimiento-caminar": {
    dibujo: conFigura(<Flecha d="M 12 38 H 46" />),
    frase: "Camina con él y le sigue el paso.",
  },
  "en-mano-sutil": {
    dibujo: conFigura(
      <g className="text-acento">
        <path d="M 44 34 q 4 -5 8 0 q 4 5 8 0" />
      </g>,
    ),
    frase: "Tiembla un poco, como si la sujetaras con la mano.",
  },
  "contrapicado-heroico": {
    dibujo: conFigura(<Flecha d="M 50 38 L 44 18" />),
    frase: "Sube desde abajo y le deja grande en el plano.",
  },
  "bokeh-al-fondo": {
    dibujo: conFigura(
      <g className="text-acento">
        <circle cx="50" cy="16" r="4" className="opacity-30" />
        <circle cx="56" cy="24" r="3" className="opacity-20" />
        <Flecha d="M 44 12 L 50 16" />
      </g>,
    ),
    frase: "El foco pasa de él al fondo: se ve lo que hay detrás.",
  },
  "camara-lenta": {
    dibujo: conFigura(
      <g className="text-acento">
        <circle cx="52" cy="22" r="8" />
        <path d="M 52 17 v 5 l 4 3" />
      </g>,
    ),
    frase: "Todo se mueve más despacio de lo normal.",
  },
};

/** Lo que se enseña cuando quien administra ha añadido una opción que el código no conoce. */
const GENERICO = {
  dibujo: (
    <>
      <Suelo />
      <Figura y={14} escala={0.9} />
      <Camara x={52} y={30} rot={200} />
    </>
  ),
  frase: "",
};

const POR_CATEGORIA = { plano: PLANOS, angulo: ANGULOS, camara: MOVIMIENTOS } as const;

/** Categorías que tienen pictograma propio. El resto de la dirección se elige con texto. */
export type CategoriaPictograma = keyof typeof POR_CATEGORIA;

/** La frase llana de una opción, o cadena vacía si es una que ha añadido quien administra. */
export const fraseDeOpcion = (categoria: CategoriaPictograma, clave: string): string =>
  POR_CATEGORIA[categoria][clave]?.frase ?? "";

/**
 * El pictograma de una opción del catálogo. Una clave desconocida devuelve el genérico: quien administra puede
 * añadir presets y la pantalla no se rompe ni se inventa un dibujo que no corresponde.
 */
export function Pictograma({
  categoria,
  clave,
  className,
}: {
  categoria: CategoriaPictograma;
  clave: string;
  className?: string;
}) {
  const opcion = POR_CATEGORIA[categoria][clave] ?? GENERICO;
  return <Marco className={className}>{opcion.dibujo}</Marco>;
}

// ── Momento del gesto: una mini línea de tiempo ─────────────────────────────────────────────────────────

/** Dónde cae el gesto dentro del clip: antes de la frase, encima de ella o después. */
const TRAMO: Record<string, { x: number; ancho: number; frase: string }> = {
  antes: { x: 6, ancho: 14, frase: "El gesto ocurre y luego empieza a hablar." },
  durante: { x: 21, ancho: 22, frase: "Hace el gesto mientras está hablando." },
  despues: { x: 44, ancho: 14, frase: "Termina la frase y entonces hace el gesto." },
};

export const fraseDeMomento = (momento: string): string => TRAMO[momento]?.frase ?? "";

/**
 * Línea de tiempo del clip con el gesto marcado. Se lee de izquierda a derecha como el clip: la barra apagada es
 * la frase y el tramo a color es el gesto.
 */
export function LineaDeTiempoGesto({ momento, className }: { momento: string; className?: string }) {
  const tramo = TRAMO[momento] ?? TRAMO.durante;
  if (!tramo) return null;
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
    >
      <title>Cuándo ocurre el gesto dentro del clip</title>
      {/* La frase: ocupa el centro del clip, que es donde el modelo la coloca. */}
      <rect x="21" y="24" width="22" height="7" rx="3" className="opacity-30" />
      <path d="M 6 34 H 58" className="opacity-25" />
      <rect
        x={tramo.x}
        y="12"
        width={tramo.ancho}
        height="8"
        rx="4"
        className="text-acento"
        fill="currentColor"
        fillOpacity="0.22"
      />
    </svg>
  );
}
