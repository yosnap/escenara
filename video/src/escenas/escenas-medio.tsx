// Escenas 5–8: dirección del clip, coste antes de generar, comparar modelos y
// montaje con sus formatos de exportación.
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { aparecer, entrada, salida, tramo } from "../componentes/movimiento";
import { Chip, Icono, Rotulo, Tarjeta } from "../componentes/ui";
import { Ventana } from "../componentes/ventana";
import { COLOR, DEGRADADO, FUENTE } from "../marca";
import { cuandoDice } from "../tiempos";
import type { PropsEscena } from "./escenas-inicio";

const dur = (e: PropsEscena["escena"], fps: number) => Math.round((e.fin - e.inicio) * fps);

const DIRECCION = [
  { clave: "plano", texto: "Plano", icono: "camara" },
  { clave: "angulo", texto: "Ángulo", icono: "tendencia" },
  { clave: "camara", texto: "Cámara", icono: "claqueta" },
  { clave: "accion", texto: "Acción", icono: "persona" },
  { clave: "guion", texto: "Guion", icono: "pelicula" },
] as const;

export const Escena05: React.FC<PropsEscena> = ({ escena, fps }) => {
  const f = useCurrentFrame();
  const d = dur(escena, fps);
  // «tren» casa con «trend» y con «tren» (whisper a veces no oye la d final)
  const tTrend = cuandoDice(escena, "tren", fps);
  const tDecida = cuandoDice(escena, "decida", fps);
  const vent = entrada(f, 8, 22);
  const trend = entrada(f, tTrend, 20);
  // Al «decidir la dirección», el trend rellena los cinco campos en cascada
  const relleno = (i: number) => tramo(f, tDecida + i * 3, tDecida + i * 3 + 10);
  return (
    <AbsoluteFill style={{ opacity: salida(f, d) }}>
      <Rotulo
        numero="05"
        capitulo="Dirección del clip"
        titular="Dirige cada clip"
        resaltar={["clip"]}
        desde={4}
        style={{ position: "absolute", left: 96, top: 150 }}
      />
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 400,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          alignItems: "flex-start",
        }}
      >
        {DIRECCION.map((x, i) => {
          const t = cuandoDice(escena, x.clave, fps);
          const golpe = tramo(f, t, t + 6) - tramo(f, t + 10, t + 22) * 0.6;
          return (
            <Chip
              key={x.clave}
              icono={x.icono}
              texto={x.texto}
              tam={28}
              p={entrada(f, t - 2, 12)}
              activo={Math.max(golpe, relleno(i))}
            />
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 470, top: 470, ...aparecer(trend, 40) }}>
        <Tarjeta p={1} ancho={330} style={{ border: `2px solid ${COLOR.fucsia}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: 16,
                background: DEGRADADO.atardecer,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icono nombre="tendencia" tam={36} color="#FFFFFF" />
            </div>
            <div style={{ fontSize: 30, fontWeight: 800 }}>Trend vigente</div>
          </div>
          <div style={{ marginTop: 14, fontSize: 24, color: COLOR.textoSuave, fontWeight: 600, lineHeight: 1.35 }}>
            Decide la dirección
          </div>
          <div
            style={{
              position: "absolute",
              left: -46,
              top: 70,
              opacity: tramo(f, tDecida - 4, tDecida + 4),
              transform: "rotate(180deg)",
            }}
          >
            <Icono nombre="flecha" tam={40} color={COLOR.fucsia} />
          </div>
        </Tarjeta>
      </div>
      <div style={{ position: "absolute", left: 900, top: 140, ...aparecer(vent, 50) }}>
        <Ventana
          captura="0.25.2-mis-direcciones-claro.webp"
          region={{ x: 0, y: 30, w: 1664, h: 1078 }}
          regionFinal={{ x: 0, y: 322, w: 1664, h: 1078 }}
          zoom={tramo(f, 20, d - 10, (x) => x)}
          ancho={920}
          alto={640}
          titulo="Escenara · Dirección del clip"
          claro
        />
      </div>
    </AbsoluteFill>
  );
};

// Zona de claridad: fondo neutro, sin degradados sobre texto, contraste alto
export const Escena06: React.FC<PropsEscena> = ({ escena, fps }) => {
  const f = useCurrentFrame();
  const d = dur(escena, fps);
  const tNada = cuandoDice(escena, "nada", fps);
  const tConfirmacion = cuandoDice(escena, "confirmacion", fps);
  const v1 = entrada(f, 6, 20);
  const v2 = entrada(f, tNada - 4, 20);
  const ok = entrada(f, tConfirmacion, 16);
  return (
    <AbsoluteFill style={{ opacity: salida(f, d) }}>
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 150,
          width: 720,
          fontFamily: FUENTE,
          ...aparecer(entrada(f, 2), 20),
        }}
      >
        <div style={{ fontSize: 26, fontWeight: 700, color: COLOR.aviso, letterSpacing: 0.5 }}>
          06 · COSTE ANTES DE GENERAR
        </div>
        <div style={{ marginTop: 22, fontSize: 72, lineHeight: 1.1, fontWeight: 800, color: COLOR.texto }}>
          Antes de generar, ves lo que costará
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 600,
          display: "flex",
          alignItems: "center",
          gap: 18,
          fontFamily: FUENTE,
          ...aparecer(ok, 30),
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: COLOR.correcto,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icono nombre="check" tam={44} color={COLOR.fondo} grosor={2.6} />
        </div>
        <div style={{ fontSize: 38, fontWeight: 800, color: COLOR.texto }}>Nada se cobra sin tu confirmación</div>
      </div>
      <div style={{ position: "absolute", left: 930, top: 140, ...aparecer(v1, 40) }}>
        <Ventana
          captura="0.17.0-guion-claro.webp"
          region={{ x: 470, y: 560, w: 1000, h: 467 }}
          ancho={880}
          alto={390}
          titulo="Escenara · El plan y su coste"
          claro
        />
      </div>
      <div style={{ position: "absolute", left: 1010, top: 470, ...aparecer(v2, 40) }}>
        <Ventana
          captura="0.31.0-nora-dos-clips.png"
          region={{ x: 790, y: 272, w: 980, h: 452 }}
          ancho={800}
          alto={413}
          titulo="Escenara · Producción"
        />
      </div>
    </AbsoluteFill>
  );
};

// Columnas de modelos en la tabla real de comparación (px de origen)
const COLUMNAS = [
  { x: 180, w: 325 },
  { x: 505, w: 290 },
  { x: 795, w: 293 },
];

export const Escena07: React.FC<PropsEscena> = ({ escena, fps }) => {
  const f = useCurrentFrame();
  const d = dur(escena, fps);
  const tModelos = cuandoDice(escena, "modelos", fps);
  const tMejor = cuandoDice(escena, "mejor", fps);
  const v1 = entrada(f, 6, 20);
  const v2 = entrada(f, tModelos + 6, 22);
  const ancho = 900;
  const escala = ancho / 1088;
  // El foco recorre las tres columnas: comparar lado a lado
  const recorrido = interpolate(f, [tModelos + 14, tMejor - 4], [0, 2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const i = Math.min(2, Math.floor(recorrido));
  const c = COLUMNAS[i];
  const mejor = entrada(f, tMejor, 16);
  return (
    <AbsoluteFill style={{ opacity: salida(f, d) }}>
      <Rotulo
        numero="07"
        capitulo="Comparar modelos"
        titular="Compara con tu propio material"
        resaltar={["propio", "material"]}
        desde={2}
        ancho={720}
        tam={68}
        style={{ position: "absolute", left: 96, top: 150 }}
      />
      <Chip
        icono="check"
        texto="Quédate con el mejor"
        p={mejor}
        activo={tramo(f, tMejor + 2, tMejor + 12)}
        style={{ position: "absolute", left: 96, top: 520 }}
      />
      <div style={{ position: "absolute", left: 940, top: 120, opacity: v1 * (1 - v2 * 0.7), ...aparecer(v1, 40) }}>
        <Ventana
          captura="0.49.0-comparar-claro.webp"
          region={{ x: 60, y: 120, w: 1160, h: 600 }}
          ancho={860}
          alto={470}
          titulo="Escenara · Comparar"
          claro
        />
      </div>
      <div style={{ position: "absolute", left: 900, top: 290, ...aparecer(v2, 50) }}>
        <div style={{ position: "relative" }}>
          <Ventana
            captura="0.49.0-comparar-tabla-oscuro.webp"
            region={{ x: 0, y: 0, w: 1088, h: 626 }}
            ancho={ancho}
            alto={Math.round(626 * escala) + 44}
            titulo="Lado a lado"
          />
          <div
            style={{
              position: "absolute",
              left: c.x * escala,
              top: 44 + 4,
              width: c.w * escala,
              height: 626 * escala - 8,
              borderRadius: 14,
              border: `3px solid ${COLOR.chispa}`,
              background: "rgba(255,173,120,0.08)",
              opacity: tramo(f, tModelos + 10, tModelos + 18) * (1 - mejor),
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const FORMATOS = [
  { r: "9:16", w: 9, h: 16, grupo: "vertical" },
  { r: "4:5", w: 4, h: 5, grupo: "vertical" },
  { r: "1:1", w: 1, h: 1, grupo: "cuadrado" },
  { r: "16:9", w: 16, h: 9, grupo: "apaisado" },
] as const;

export const Escena08: React.FC<PropsEscena> = ({ escena, fps }) => {
  const f = useCurrentFrame();
  const d = dur(escena, fps);
  const t = {
    voz: cuandoDice(escena, "voz", fps),
    musica: cuandoDice(escena, "musica", fps),
    subtitulos: cuandoDice(escena, "subtitulos", fps),
    vertical: cuandoDice(escena, "vertical", fps),
    cuadrado: cuandoDice(escena, "cuadrado", fps),
    apaisado: cuandoDice(escena, "apaisado", fps),
  };
  const v1 = entrada(f, 6, 20);
  const alto = 230;
  return (
    <AbsoluteFill style={{ opacity: salida(f, d) }}>
      <Rotulo
        numero="08"
        capitulo="Montaje"
        titular="Monta el reel y expórtalo"
        resaltar={["reel"]}
        desde={2}
        ancho={760}
        tam={68}
        style={{ position: "absolute", left: 96, top: 150 }}
      />
      <div style={{ position: "absolute", left: 96, top: 410, display: "flex", gap: 14 }}>
        <Chip icono="persona" texto="Voz" tam={26} p={entrada(f, t.voz)} />
        <Chip icono="pelicula" texto="Música" tam={26} p={entrada(f, t.musica)} />
        <Chip icono="claqueta" texto="Subtítulos" tam={26} p={entrada(f, t.subtitulos)} />
      </div>
      <div style={{ position: "absolute", left: 960, top: 130, ...aparecer(v1, 40) }}>
        <Ventana
          captura="0.32.0-montaje-claro.webp"
          region={{ x: 0, y: 0, w: 960, h: 520 }}
          ancho={860}
          alto={420}
          titulo="Escenara · Montaje"
        />
      </div>
      <div style={{ position: "absolute", left: 1080, top: 420, ...aparecer(entrada(f, t.vertical - 12, 20), 40) }}>
        <Ventana
          captura="0.32.0-exportacion-lista.webp"
          region={{ x: 0, y: 0, w: 960, h: 600 }}
          ancho={740}
          alto={460}
          titulo="Escenara · Exportar"
        />
      </div>
      <div style={{ position: "absolute", left: 96, top: 580, display: "flex", alignItems: "flex-end", gap: 34 }}>
        {FORMATOS.map((x, i) => {
          const h = x.w > x.h ? alto * 0.72 : alto;
          const w = (h * x.w) / x.h;
          const p = entrada(f, t.vertical - 30 + i * 5, 16);
          const brillo = tramo(f, t[x.grupo], t[x.grupo] + 8);
          return (
            <div
              key={x.r}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, ...aparecer(p, 30) }}
            >
              <div
                style={{
                  width: w,
                  height: h,
                  borderRadius: 16,
                  border: `3px solid ${brillo > 0.5 ? "transparent" : "rgba(255,255,255,0.3)"}`,
                  background: brillo > 0 ? DEGRADADO.escenario : COLOR.superficie,
                  opacity: 0.35 + 0.65 * Math.max(brillo, 0.4),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: FUENTE,
                  fontWeight: 800,
                  fontSize: 34,
                  color: "#FFFFFF",
                  boxShadow: brillo > 0 ? `0 16px 50px rgba(232,69,139,${0.4 * brillo})` : undefined,
                }}
              >
                {x.r}
              </div>
              <div
                style={{
                  fontFamily: FUENTE,
                  fontWeight: 700,
                  fontSize: 24,
                  color: brillo > 0.5 ? COLOR.texto : COLOR.textoSuave,
                  textTransform: "capitalize",
                }}
              >
                {x.grupo}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
