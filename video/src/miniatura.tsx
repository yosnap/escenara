// Miniatura de YouTube (1280×720): logotipo, lema y miniaturas de pantallas
// reales de la interfaz. Sin caras.
import { AbsoluteFill, Img, staticFile } from "remotion";
import { Fondo } from "./componentes/fondo";
import { Ventana } from "./componentes/ventana";
import { DEGRADADO, FUENTE } from "./marca";

export const Miniatura: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: FUENTE }}>
    <Fondo intensidad={1.8} />
    <div style={{ position: "absolute", right: -60, top: 60, transform: "rotate(-4deg)" }}>
      <Ventana
        captura="0.25.2-mis-direcciones-claro.webp"
        region={{ x: 0, y: 0, w: 1664, h: 1000 }}
        ancho={500}
        alto={330}
        claro
      />
    </div>
    <div style={{ position: "absolute", right: 40, top: 380, transform: "rotate(3deg)" }}>
      <Ventana
        captura="0.49.0-comparar-tabla-oscuro.webp"
        region={{ x: 0, y: 0, w: 1088, h: 626 }}
        ancho={470}
        alto={300}
      />
    </div>
    <div style={{ position: "absolute", left: 70, top: 170, width: 600 }}>
      <Img src={staticFile("marca/escenara-horizontal-dark.svg")} style={{ width: 520 }} />
      <div
        style={{
          marginTop: 34,
          fontSize: 84,
          lineHeight: 1.02,
          fontWeight: 800,
          letterSpacing: -2,
          backgroundImage: DEGRADADO.escenario,
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          color: "transparent",
        }}
      >
        Da vida a<br />
        cada escena
      </div>
    </div>
  </AbsoluteFill>
);
