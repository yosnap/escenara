// Escenas 9–11: comunidad con moderación previa, tus datos y cierre con marca.
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { aparecer, entrada, salida, tramo } from "../componentes/movimiento";
import { Chip, Icono, Rotulo } from "../componentes/ui";
import { Ventana } from "../componentes/ventana";
import { COLOR, DEGRADADO, FUENTE, MONO } from "../marca";
import { cuandoDice } from "../tiempos";
import type { PropsEscena } from "./escenas-inicio";

const dur = (e: PropsEscena["escena"], fps: number) => Math.round((e.fin - e.inicio) * fps);

export const Escena09: React.FC<PropsEscena> = ({ escena, fps }) => {
  const f = useCurrentFrame();
  const d = dur(escena, fps);
  const tSintetico = cuandoDice(escena, "sintetico", fps);
  const tModeracion = cuandoDice(escena, "moderacion", fps);
  const tNunca = cuandoDice(escena, "nunca", fps);
  const v1 = entrada(f, 6, 20);
  const v2 = entrada(f, tModeracion - 4, 22);
  const v3 = entrada(f, tNunca - 4, 22);
  return (
    <AbsoluteFill style={{ opacity: salida(f, d) }}>
      <Rotulo
        numero="09"
        capitulo="Comunidad"
        titular="Comparte contenido sintético"
        resaltar={["sintético"]}
        desde={2}
        ancho={760}
        tam={68}
        style={{ position: "absolute", left: 96, top: 150 }}
      />
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 420,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          alignItems: "flex-start",
        }}
      >
        <Chip
          icono="chispa"
          texto="Contenido sintético"
          p={entrada(f, tSintetico)}
          activo={tramo(f, tSintetico, tSintetico + 10)}
        />
        <Chip
          icono="escudo"
          texto="Moderación previa"
          p={entrada(f, tModeracion)}
          activo={tramo(f, tModeracion, tModeracion + 10)}
          degradado={DEGRADADO.foco}
        />
      </div>
      {/* «Nunca fotos reales»: aviso en superficie neutra, sin degradado (zona de claridad) */}
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 640,
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "18px 26px",
          borderRadius: 20,
          background: COLOR.superficie,
          border: `2px solid ${COLOR.aviso}`,
          fontFamily: FUENTE,
          ...aparecer(v3, 30),
        }}
      >
        <Icono nombre="sinFoto" tam={48} color={COLOR.aviso} grosor={2.2} />
        <div style={{ fontSize: 40, fontWeight: 800, color: COLOR.texto }}>Nunca fotos reales</div>
      </div>
      <div style={{ position: "absolute", left: 940, top: 130, opacity: 1 - v2 * 0.6, ...aparecer(v1, 40) }}>
        <Ventana
          captura="0.49.0-comunidad-encendida-oscuro.webp"
          region={{ x: 60, y: 120, w: 1160, h: 620 }}
          ancho={860}
          alto={500}
          titulo="Escenara · Comunidad"
        />
      </div>
      <div style={{ position: "absolute", left: 1060, top: 250, opacity: 1 - v3 * 0.6, ...aparecer(v2, 40) }}>
        <Ventana
          captura="0.49.0-moderacion-oscuro.webp"
          region={{ x: 60, y: 200, w: 1160, h: 620 }}
          ancho={760}
          alto={440}
          titulo="Escenara · Admin › Moderación"
        />
      </div>
      <div style={{ position: "absolute", left: 900, top: 380, ...aparecer(v3, 40) }}>
        <Ventana
          captura="0.49.0-comunidad-publicar-claro.webp"
          region={{ x: 200, y: 330, w: 900, h: 300 }}
          ancho={900}
          alto={344}
          titulo="Escenara · Publicar en la comunidad"
          claro
        />
      </div>
    </AbsoluteFill>
  );
};

export const Escena10: React.FC<PropsEscena> = ({ escena, fps }) => {
  const f = useCurrentFrame();
  const d = dur(escena, fps);
  const tExporta = cuandoDice(escena, "exportalos", fps);
  const tBorra = cuandoDice(escena, "borralos", fps);
  const v1 = entrada(f, 6, 20);
  const v2 = entrada(f, 16, 22);
  return (
    <AbsoluteFill style={{ opacity: salida(f, d) }}>
      <Rotulo
        numero="10"
        capitulo="Tus datos"
        titular="Tus datos son tuyos"
        resaltar={["tuyos"]}
        desde={2}
        style={{ position: "absolute", left: 96, top: 150 }}
      />
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 440,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          alignItems: "flex-start",
        }}
      >
        <Chip
          icono="descargar"
          texto="Expórtalos"
          p={entrada(f, tExporta)}
          activo={tramo(f, tExporta, tExporta + 10)}
        />
        <Chip
          icono="papelera"
          texto="Bórralos cuando quieras"
          p={entrada(f, tBorra)}
          activo={tramo(f, tBorra, tBorra + 10)}
          degradado={DEGRADADO.chispa}
        />
      </div>
      <div style={{ position: "absolute", left: 1000, top: 130, opacity: 0.85, ...aparecer(v1, 40) }}>
        <Ventana
          captura="0.49.0-historial-cuenta-oscuro.webp"
          region={{ x: 180, y: 120, w: 940, h: 520 }}
          ancho={800}
          alto={480}
          titulo="Escenara · Tu historial"
        />
      </div>
      <div style={{ position: "absolute", left: 880, top: 470, ...aparecer(v2, 40) }}>
        <Ventana
          captura="0.49.0-cuenta-tus-datos-claro.webp"
          region={{ x: 0, y: 0, w: 832, h: 222 }}
          ancho={900}
          alto={284}
          titulo="Escenara · Tu cuenta"
          claro
        />
      </div>
    </AbsoluteFill>
  );
};

export const Escena11: React.FC<PropsEscena> = ({ escena, fps }) => {
  const f = useCurrentFrame();
  const d = dur(escena, fps);
  const tEscenara = cuandoDice(escena, "escenara", fps);
  const tDa = cuandoDice(escena, "da", fps);
  const tCodigo = cuandoDice(escena, "codigo", fps);
  const logo = entrada(f, tEscenara, 24);
  const lema = entrada(f, tDa, 18);
  const codigo = entrada(f, tCodigo, 18);
  const brillo = interpolate(f, [tEscenara, tEscenara + 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Fundido final a negro en los últimos 24 cuadros
  const fin = interpolate(f, [d - 24, d], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: fin, fontFamily: FUENTE }}>
      <div
        style={{
          position: "absolute",
          width: 1100,
          height: 1100,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${COLOR.fucsiaClaro}55 0%, transparent 62%)`,
          opacity: brillo * 0.8,
          transform: `scale(${0.7 + brillo * 0.3})`,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: -80 }}>
        <Img
          src={staticFile("marca/escenara-horizontal-dark.svg")}
          style={{ width: 980, transform: `scale(${0.8 + logo * 0.2})`, opacity: logo }}
        />
        <div
          style={{
            marginTop: 30,
            fontSize: 76,
            fontWeight: 800,
            letterSpacing: -1.5,
            backgroundImage: DEGRADADO.escenario,
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            color: "transparent",
            ...aparecer(lema, 30),
          }}
        >
          Da vida a cada escena
        </div>
        <div
          style={{
            marginTop: 44,
            display: "flex",
            alignItems: "center",
            gap: 18,
            padding: "16px 30px",
            borderRadius: 999,
            background: COLOR.superficie,
            border: "1px solid rgba(255,255,255,0.16)",
            ...aparecer(codigo, 24),
          }}
        >
          <Icono nombre="codigo" tam={38} color={COLOR.acento} />
          <span style={{ fontSize: 34, fontWeight: 700, color: COLOR.texto }}>Código abierto en GitHub</span>
          <span style={{ fontFamily: MONO, fontSize: 30, color: COLOR.acento }}>github.com/yosnap/escenara</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
