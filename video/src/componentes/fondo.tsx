// Fondo oscuro de marca con manchas de color que derivan despacio (parallax
// suave). En las «zonas de claridad» (costes) se usa `sobrio`: sin color.
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COLOR } from "../marca";

const MANCHAS = [
  { color: COLOR.cobaltoClaro, x: 18, y: 22, r: 620, vx: 0.9, vy: 0.6, fase: 0 },
  { color: COLOR.fucsiaClaro, x: 82, y: 30, r: 560, vx: 0.7, vy: 0.8, fase: 1.7 },
  { color: COLOR.coralClaro, x: 70, y: 88, r: 600, vx: 0.8, vy: 0.5, fase: 3.1 },
  { color: COLOR.cian, x: 10, y: 90, r: 420, vx: 0.6, vy: 0.9, fase: 4.4 },
];

export const Fondo: React.FC<{ sobrio?: boolean; intensidad?: number }> = ({ sobrio = false, intensidad = 1 }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: COLOR.fondo, overflow: "hidden" }}>
      {!sobrio &&
        MANCHAS.map((m) => {
          const t = f / 30;
          const x = m.x + Math.sin(t * 0.12 * m.vx + m.fase) * 6;
          const y = m.y + Math.cos(t * 0.1 * m.vy + m.fase) * 5;
          return (
            <div
              key={m.color}
              style={{
                position: "absolute",
                left: `${x}%`,
                top: `${y}%`,
                width: m.r * 2,
                height: m.r * 2,
                marginLeft: -m.r,
                marginTop: -m.r,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${m.color} 0%, transparent 65%)`,
                opacity: 0.22 * intensidad,
              }}
            />
          );
        })}
      {/* Rejilla de 8 px muy tenue: da textura de «estudio» */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${COLOR.texto}08 1px, transparent 1px), linear-gradient(90deg, ${COLOR.texto}08 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
          opacity: sobrio ? 0.35 : 0.6,
        }}
      />
    </AbsoluteFill>
  );
};
