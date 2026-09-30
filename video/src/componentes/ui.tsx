// Piezas gráficas del vídeo: iconos lineales (1,75–2 px, extremos redondeados,
// como pide la guía de marca), rótulos animados y chips.
import { useCurrentFrame } from "remotion";
import { COLOR, DEGRADADO, FUENTE } from "../marca";
import { aparecer, entrada } from "./movimiento";

const TRAZOS = {
  llave: "M15 7a4 4 0 1 1-3.9 4.9L4 19v-3h3v-3h3l1.1-1.1A4 4 0 0 1 15 7Zm1.5 2.5h.01",
  camara: "M4 8h3l2-3h6l2 3h3v11H4V8Zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  sinFoto: "M4 8h3l2-3h6l2 3h3v11H4V8Zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM3 3l18 18",
  check: "M5 12.5l4.5 4.5L19 7.5",
  chispa: "M12 3l1.8 5.4L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.6L12 3Z",
  descargar: "M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14",
  papelera: "M5 7h14M10 7V5h4v2m-7 0l1 12h8l1-12",
  personas:
    "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5 8c.5-3 2.5-5 5-5s4.5 2 5 5m1.5-8a2.5 2.5 0 1 0 0-5M17 14c2 .4 3.2 2 3.5 5",
  escudo: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Zm-3 9l2 2 4-4",
  moneda:
    "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm2.5-10.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2 0 2.8 5 1.5 5 4.2 0 1.2-1.1 2-2.5 2-1.1 0-2.1-.5-2.6-1.5M12 6.5V8m0 8v1.5",
  lugar: "M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10Zm0-7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  caja: "M4 8l8-4 8 4v8l-8 4-8-4V8Zm0 0l8 4 8-4m-8 4v8",
  claqueta: "M4 10h16v10H4V10Zm0 0l1.5-5 15 3.5L19 10M9 6l-1 4m6-2.5L13 10",
  balanza: "M12 4v16M7 20h10M5 7h14M5 7l-3 6a3 3 0 0 0 6 0L5 7Zm14 0l-3 6a3 3 0 0 0 6 0l-3-6",
  pelicula: "M4 5h16v14H4V5Zm4 0v14m8-14v14M4 9h4m8 0h4M4 15h4m8 0h4",
  candado: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6v-9Z",
  codigo: "M9 8l-4 4 4 4m6-8l4 4-4 4M13.5 5l-3 14",
  tendencia: "M4 16l5-5 4 4 7-7m0 0h-5m5 0v5",
  flecha: "M5 12h14m-5-5l5 5-5 5",
  persona: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c.7-4 3.5-6 7-6s6.3 2 7 6",
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export const Icono: React.FC<{ nombre: NombreIcono; tam?: number; color?: string; grosor?: number }> = ({
  nombre,
  tam = 32,
  color = COLOR.texto,
  grosor = 1.9,
}) => (
  <svg
    aria-hidden="true"
    width={tam}
    height={tam}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={grosor}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={TRAZOS[nombre]} />
  </svg>
);

/** Rótulo de escena: etiqueta de capítulo + titular que entra palabra a palabra. */
export const Rotulo: React.FC<{
  numero: string;
  capitulo: string;
  titular: string;
  /** palabras del titular pintadas con degradado */
  resaltar?: string[];
  desde?: number;
  tam?: number;
  ancho?: number;
  style?: React.CSSProperties;
}> = ({ numero, capitulo, titular, resaltar = [], desde = 6, tam = 76, ancho = 760, style }) => {
  const f = useCurrentFrame();
  const pe = entrada(f, desde - 4, 14);
  // Cada palabra con su posición como clave estable (el titular no cambia)
  const palabras = titular.split(" ").map((w, n) => ({ w, id: `${n}-${w}` }));
  return (
    <div style={{ width: ancho, fontFamily: FUENTE, ...style }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 14,
          padding: "10px 20px 10px 12px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.12)",
          ...aparecer(pe, 16),
        }}
      >
        <span
          style={{
            fontWeight: 800,
            fontSize: 22,
            color: COLOR.fondo,
            background: DEGRADADO.chispa,
            borderRadius: 999,
            padding: "4px 12px",
          }}
        >
          {numero}
        </span>
        <span style={{ fontWeight: 600, fontSize: 26, color: COLOR.textoSuave, letterSpacing: 0.3 }}>{capitulo}</span>
      </div>
      <div
        style={{
          marginTop: 26,
          fontSize: tam,
          lineHeight: 1.08,
          fontWeight: 800,
          color: COLOR.texto,
          letterSpacing: -1.5,
        }}
      >
        {palabras.map(({ w, id }, i) => {
          const p = entrada(f, desde + i * 3, 16);
          const limpio = w.replace(/[.,:]/g, "");
          const brillo = resaltar.includes(limpio);
          return (
            <span
              key={id}
              style={{
                display: "inline-block",
                marginRight: tam * 0.26,
                ...aparecer(p, 30),
                ...(brillo
                  ? {
                      backgroundImage: DEGRADADO.escenario,
                      backgroundClip: "text",
                      WebkitBackgroundClip: "text",
                      color: "transparent",
                    }
                  : {}),
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    </div>
  );
};

/** Chip con icono. `activo` lo rellena con degradado (p. ej. al decirse su palabra). */
export const Chip: React.FC<{
  icono?: NombreIcono;
  texto: string;
  p: number;
  activo?: number;
  tam?: number;
  degradado?: string;
  style?: React.CSSProperties;
}> = ({ icono, texto, p, activo = 0, tam = 30, degradado = DEGRADADO.escenario, style }) => (
  <div
    style={{
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      gap: 12,
      padding: `${tam * 0.45}px ${tam * 0.9}px`,
      borderRadius: 999,
      fontFamily: FUENTE,
      fontWeight: 700,
      fontSize: tam,
      color: COLOR.texto,
      background: COLOR.superficie,
      border: `1.5px solid rgba(255,255,255,${0.14 + activo * 0.2})`,
      boxShadow: activo > 0 ? `0 10px 40px rgba(232,69,139,${0.35 * activo})` : "0 8px 24px rgba(0,0,0,0.35)",
      overflow: "hidden",
      opacity: p,
      transform: `translateY(${(1 - p) * 24}px) scale(${0.9 + p * 0.1 + activo * 0.04})`,
      ...style,
    }}
  >
    <div style={{ position: "absolute", inset: 0, background: degradado, opacity: activo }} />
    {icono && (
      <span style={{ position: "relative", display: "flex" }}>
        <Icono nombre={icono} tam={tam * 1.1} color={activo > 0.5 ? "#FFFFFF" : COLOR.acento} />
      </span>
    )}
    <span style={{ position: "relative" }}>{texto}</span>
  </div>
);

/** Tarjeta de texto breve (infografías). */
export const Tarjeta: React.FC<{
  children: React.ReactNode;
  p: number;
  ancho?: number;
  style?: React.CSSProperties;
}> = ({ children, p, ancho, style }) => (
  <div
    style={{
      width: ancho,
      padding: "26px 30px",
      borderRadius: 22,
      background: COLOR.superficie,
      border: "1px solid rgba(255,255,255,0.12)",
      boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
      fontFamily: FUENTE,
      color: COLOR.texto,
      ...aparecer(p, 30),
      ...style,
    }}
  >
    {children}
  </div>
);
