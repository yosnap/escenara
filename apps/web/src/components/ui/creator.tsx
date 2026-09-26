import { AlertTriangle, CheckCircle2, Clock3, ImageOff, Play } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

/** Familias de color por especialidad (dirección visual «Escenario»). */
export type Tono = "cobalto" | "coral" | "mandarina" | "sol" | "fucsia" | "cian";

const TONOS: Record<Tono, { borde: string; fondo: string; punto: string }> = {
  cobalto: { borde: "border-v-cobalto", fondo: "bg-v-cobalto/12", punto: "bg-v-cobalto" },
  coral: { borde: "border-v-coral", fondo: "bg-v-coral/12", punto: "bg-v-coral" },
  mandarina: { borde: "border-v-mandarina", fondo: "bg-v-mandarina/14", punto: "bg-v-mandarina" },
  sol: { borde: "border-v-sol", fondo: "bg-v-sol/18", punto: "bg-v-sol" },
  fucsia: { borde: "border-v-fucsia", fondo: "bg-v-fucsia/12", punto: "bg-v-fucsia" },
  cian: { borde: "border-v-cian", fondo: "bg-v-cian/14", punto: "bg-v-cian" },
};

/** Botón grande de preset (especialidad, formato, estilo). Conmutable y con color de su familia. */
export function ChipPreset({
  etiqueta,
  icono,
  tono,
  activo,
  onClick,
}: {
  etiqueta: string;
  icono: ReactNode;
  tono: Tono;
  activo?: boolean;
  onClick?: () => void;
}) {
  const t = TONOS[tono];
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-tarjeta border-2 px-4 py-2.5 text-left font-semibold text-texto transition-all duration-(--motion-base) hover:-translate-y-0.5 hover:shadow-lg",
        activo ? cn(t.borde, t.fondo, "shadow-md") : "border-borde/60 bg-superficie",
      )}
    >
      <span className={cn("flex size-9 items-center justify-center rounded-full text-[#182032]", t.punto)} aria-hidden>
        {icono}
      </span>
      {etiqueta}
    </button>
  );
}

/** Pegatina: etiqueta redondeada para «Nuevo», «Remezcla», «Reto», «Idea». */
export function Pegatina({ children, tono = "coral" }: { children: ReactNode; tono?: Tono }) {
  return (
    <span
      className={cn(
        "inline-flex -rotate-2 items-center gap-1 rounded-full px-3 py-1 text-sm font-bold text-[#182032] shadow-sm",
        TONOS[tono].punto,
      )}
    >
      {children}
    </span>
  );
}

export type EstadoPersonaje = "listo" | "faltan-fotos" | "en-revision";

const ESTADOS: Record<EstadoPersonaje, { anillo: string; texto: string; icono: ReactNode }> = {
  listo: { anillo: "bg-degradado-escenario", texto: "Listo", icono: <CheckCircle2 className="size-3.5" /> },
  "faltan-fotos": { anillo: "bg-aviso", texto: "Faltan fotos", icono: <AlertTriangle className="size-3.5" /> },
  "en-revision": { anillo: "bg-borde", texto: "En revisión", icono: <Clock3 className="size-3.5" /> },
};

/** Avatar de personaje con anillo de historia; el estado se indica también con icono y texto. */
export function AnilloHistoria({
  nombre,
  imagen,
  estado,
  tamano = 88,
}: {
  nombre: string;
  imagen?: string;
  estado: EstadoPersonaje;
  tamano?: number;
}) {
  const e = ESTADOS[estado];
  return (
    <figure className="flex w-min flex-col items-center gap-1.5">
      <div className={cn("rounded-full p-[3px]", e.anillo)} style={{ width: tamano, height: tamano }}>
        <div className="size-full overflow-hidden rounded-full border-[3px] border-fondo bg-elevada">
          {imagen ? (
            // biome-ignore lint/performance/noImgElement: imagen de usuario de tamaño fijo en el catálogo
            <img src={imagen} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-2xl font-bold text-texto-suave">
              {nombre.slice(0, 1)}
            </span>
          )}
        </div>
      </div>
      <figcaption className="text-center">
        <span className="block text-sm font-semibold text-texto">{nombre}</span>
        <span className="flex items-center justify-center gap-1 text-xs text-texto-suave">
          {e.icono}
          {e.texto}
        </span>
      </figcaption>
    </figure>
  );
}

/** Tarjeta vertical 9:16 tipo reel para escenas, plantillas y vídeos. */
export function TarjetaReel({
  titulo,
  subtitulo,
  duracion,
  imagen,
  pegatina,
  tono = "cobalto",
}: {
  titulo: string;
  subtitulo?: string;
  duracion?: string;
  imagen?: string;
  pegatina?: ReactNode;
  tono?: Tono;
}) {
  return (
    <article className="group relative aspect-9/16 w-44 overflow-hidden rounded-tarjeta bg-elevada shadow-md transition-transform duration-(--motion-base) hover:-translate-y-1 hover:shadow-xl">
      {imagen ? (
        // biome-ignore lint/performance/noImgElement: miniatura de ejemplo
        <img src={imagen} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className={cn("absolute inset-0 flex items-center justify-center opacity-90", TONOS[tono].punto)}>
          <ImageOff className="size-8 text-[#182032]/60" aria-hidden />
        </div>
      )}
      {pegatina && <div className="absolute top-2.5 left-2.5">{pegatina}</div>}
      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 to-transparent p-3 pt-10 text-white">
        <h3 className="font-bold leading-tight">{titulo}</h3>
        {subtitulo && <p className="text-sm opacity-85">{subtitulo}</p>}
      </div>
      {duracion && (
        <span className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 font-mono text-xs text-white">
          <Play className="size-3" aria-hidden /> {duracion}
        </span>
      )}
    </article>
  );
}
