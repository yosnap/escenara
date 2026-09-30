// Capas por encima de las escenas: barra del flujo (infografía de los pasos),
// cortinilla entre escenas y subtítulos incrustados.
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLOR, DEGRADADO, FUENTE } from "../marca";
import type { Tiempos } from "../tiempos";
import { entrada } from "./movimiento";
import { Icono, type NombreIcono } from "./ui";

export const PASOS: { id: string; texto: string; icono: NombreIcono }[] = [
  { id: "03", texto: "Personaje", icono: "persona" },
  { id: "04", texto: "Producto y lugar", icono: "lugar" },
  { id: "05", texto: "Dirección", icono: "claqueta" },
  { id: "06", texto: "Coste", icono: "moneda" },
  { id: "07", texto: "Comparar", icono: "balanza" },
  { id: "08", texto: "Montaje", icono: "pelicula" },
  { id: "09", texto: "Comunidad", icono: "personas" },
];

/** Flujo personaje → … → comunidad, arriba a la derecha, con el paso actual resaltado. */
export const BarraFlujo: React.FC<{ tiempos: Tiempos }> = ({ tiempos }) => {
  const f = useCurrentFrame();
  const t = f / tiempos.fps;
  const escenas = tiempos.escenas;
  const primera = escenas.find((e) => e.id.startsWith("03"));
  const ultima = escenas.find((e) => e.id.startsWith("09"));
  if (!primera || !ultima) throw new Error("tiempos.json sin las escenas 03 y 09");
  if (t < primera.inicio || t >= ultima.fin) return null;
  const pe = entrada(f, Math.round(primera.inicio * tiempos.fps) + 6, 20);
  const ps = interpolate(t, [ultima.fin - 0.4, ultima.fin], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const actual = escenas.find((e) => t >= e.inicio && t < e.fin)?.id.slice(0, 2);
  return (
    <div
      style={{
        position: "absolute",
        top: 40,
        right: 64,
        display: "flex",
        alignItems: "center",
        gap: 6,
        opacity: pe * ps,
        fontFamily: FUENTE,
      }}
    >
      {PASOS.map((p, i) => {
        const activo = p.id === actual;
        const hecho = actual !== undefined && p.id < actual;
        return (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {i > 0 && (
              <div
                style={{ width: 18, height: 2, background: hecho || activo ? COLOR.chispa : "rgba(255,255,255,0.2)" }}
              />
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: activo ? "8px 16px" : "8px 10px",
                borderRadius: 999,
                background: activo ? DEGRADADO.escenario : hecho ? "rgba(255,173,120,0.16)" : "rgba(255,255,255,0.06)",
                border: `1px solid ${activo ? "transparent" : "rgba(255,255,255,0.12)"}`,
                color: activo ? "#FFFFFF" : hecho ? COLOR.chispa : COLOR.textoSuave,
                fontSize: 19,
                fontWeight: 700,
              }}
            >
              <Icono
                nombre={hecho ? "check" : p.icono}
                tam={20}
                color={activo ? "#FFFFFF" : hecho ? COLOR.chispa : COLOR.textoSuave}
              />
              {activo && <span>{p.texto}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** Barrido diagonal con el degradado de marca centrado en cada corte (16 cuadros, sin destellos). */
export const Cortinilla: React.FC<{ tiempos: Tiempos }> = ({ tiempos }) => {
  const f = useCurrentFrame();
  const cortes = tiempos.escenas.slice(1).map((e) => Math.round(e.inicio * tiempos.fps));
  const c = cortes.find((x) => f >= x - 9 && f <= x + 9);
  if (c === undefined) return null;
  const x = interpolate(f, [c - 9, c + 9], [-150, 150]);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: "-20%",
          left: `${x - 10}%`,
          width: "120%",
          height: "140%",
          transform: "skewX(-14deg)",
          background: `linear-gradient(90deg, transparent 0%, ${COLOR.fondo} 8%, ${COLOR.cobaltoClaro} 30%, ${COLOR.fucsiaClaro} 50%, ${COLOR.coralClaro} 70%, ${COLOR.fondo} 92%, transparent 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/** Subtítulos incrustados (mismo texto que el .srt), en la banda inferior reservada. */
export const Subtitulos: React.FC<{ tiempos: Tiempos }> = ({ tiempos }) => {
  const f = useCurrentFrame();
  const t = f / tiempos.fps;
  const s = tiempos.escenas.flatMap((e) => e.subtitulos).find((x) => t >= x.inicio && t < x.fin);
  if (!s) return null;
  const p = interpolate(t, [s.inicio, s.inicio + 0.12], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 56, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          maxWidth: 1400,
          padding: "12px 30px 14px",
          borderRadius: 16,
          background: "rgba(13,16,24,0.84)",
          color: COLOR.texto,
          fontFamily: FUENTE,
          fontWeight: 600,
          fontSize: 44,
          lineHeight: 1.3,
          textAlign: "center",
          whiteSpace: "pre-line",
          opacity: p,
        }}
      >
        {s.texto}
      </div>
    </div>
  );
};
