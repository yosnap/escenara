// Escenas 1–4: gancho, claves propias, personaje, producto y lugar.
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { entera } from "../capturas";
import { aparecer, entrada, salida, tramo } from "../componentes/movimiento";
import { Chip, Icono, Rotulo, Tarjeta } from "../componentes/ui";
import { Recorte, Ventana } from "../componentes/ventana";
import { COLOR, DEGRADADO, FUENTE } from "../marca";
import { cuandoDice, type Escena } from "../tiempos";

export type PropsEscena = { escena: Escena; fps: number };
const dur = (e: Escena, fps: number) => Math.round((e.fin - e.inicio) * fps);

// Fotogramas de «Nora» (personaje ilustrado de prueba) en dos escenas distintas
const NORA = [
  { captura: "0.31.0-nora-dos-clips.png", region: { x: 816, y: 906, w: 198, h: 350 }, texto: "Escena 1 · fotograma" },
  { captura: "0.31.0-nora-dos-clips.png", region: { x: 1282, y: 906, w: 198, h: 350 }, texto: "Escena 1 · clip" },
  { captura: "0.31.0-nora-escena-2.png", region: { x: 816, y: 676, w: 196, h: 364 }, texto: "Escena 2 · fotograma" },
] as const;

export const Escena01: React.FC<PropsEscena> = ({ escena, fps }) => {
  const f = useCurrentFrame();
  const d = dur(escena, fps);
  const marca = entrada(f, 0, 22);
  const marcaFuera = tramo(f, 26, 40);
  const tPersonajes = cuandoDice(escena, "personajes", fps);
  const tEscena = cuandoDice(escena, "escena", fps);
  const tTras = cuandoDice(escena, "tras", fps);
  const tControl = cuandoDice(escena, "control", fps);
  const tPresupuesto = cuandoDice(escena, "presupuesto", fps);
  const tEsto = cuandoDice(escena, "esto", fps);
  const logo = entrada(f, tEsto + 4, 22);
  const contenido = 1 - tramo(f, tEsto - 2, tEsto + 10);
  return (
    <AbsoluteFill>
      {/* Chispa de marca de apertura */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: marca * (1 - marcaFuera) }}>
        <Img
          src={staticFile("marca/escenara-mark-dark.svg")}
          style={{
            width: 260,
            transform: `scale(${0.7 + marca * 0.3 + marcaFuera * 0.4}) rotate(${(1 - marca) * -25}deg)`,
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill style={{ opacity: contenido }}>
        <Rotulo
          numero="01"
          capitulo="Qué es Escenara"
          titular="Personajes que siempre son el mismo"
          resaltar={["mismo"]}
          desde={32}
          style={{ position: "absolute", left: 96, top: 170 }}
        />
        <div style={{ position: "absolute", left: 96, top: 560, display: "flex", gap: 20 }}>
          <Chip icono="check" texto="Control" p={entrada(f, tControl)} activo={tramo(f, tControl, tControl + 10)} />
          <Chip
            icono="moneda"
            texto="Presupuesto"
            p={entrada(f, tPresupuesto)}
            activo={tramo(f, tPresupuesto, tPresupuesto + 10)}
            degradado={DEGRADADO.chispa}
          />
        </div>
        {NORA.map((n, i) => {
          const desde = [tPersonajes, tEscena, tTras + 6][i];
          const p = entrada(f, desde, 20);
          const deriva = interpolate(f, [0, d], [0, -18]);
          return (
            <div
              key={n.texto}
              style={{
                position: "absolute",
                left: 930 + i * 300,
                top: 170 + (i % 2) * 70 + deriva * (i + 1) * 0.5,
                ...aparecer(p, 60),
              }}
            >
              <Recorte
                captura={n.captura}
                region={n.region}
                ancho={270}
                alto={480}
                radio={22}
                style={{ boxShadow: "0 30px 70px rgba(0,0,0,0.55)", border: "2px solid rgba(255,255,255,0.12)" }}
              />
              <div
                style={{
                  marginTop: 14,
                  fontFamily: FUENTE,
                  fontSize: 22,
                  fontWeight: 700,
                  color: COLOR.textoSuave,
                  textAlign: "center",
                }}
              >
                {n.texto}
              </div>
            </div>
          );
        })}
      </AbsoluteFill>

      {/* «Esto es Escenara» */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: logo * salida(f, d, 6) }}>
        <Img
          src={staticFile("marca/escenara-horizontal-dark.svg")}
          style={{ width: 900, transform: `scale(${0.85 + logo * 0.15})` }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Escena02: React.FC<PropsEscena> = ({ escena, fps }) => {
  const f = useCurrentFrame();
  const d = dur(escena, fps);
  const tClaves = cuandoDice(escena, "claves", fps);
  const tProveedores = cuandoDice(escena, "proveedores", fps);
  const tDecides = cuandoDice(escena, "decides", fps);
  const vent = entrada(f, 10, 22);
  const zoom = tramo(f, tProveedores, tProveedores + 40);
  return (
    <AbsoluteFill style={{ opacity: salida(f, d) }}>
      <Rotulo
        numero="02"
        capitulo="Estudio abierto"
        titular="Tus claves, tu gasto"
        resaltar={["claves", "gasto"]}
        desde={4}
        style={{ position: "absolute", left: 96, top: 150 }}
      />
      <div style={{ position: "absolute", left: 96, top: 420, display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Chip icono="llave" texto="Tus claves" p={entrada(f, tClaves)} activo={tramo(f, tClaves, tClaves + 10)} />
          <div style={{ opacity: entrada(f, tProveedores - 4), display: "flex" }}>
            <Icono nombre="flecha" tam={40} color={COLOR.chispa} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, paddingLeft: 30 }}>
          {["KIE.ai", "Google Gemini"].map((t, i) => (
            <Chip key={t} texto={t} tam={26} p={entrada(f, tProveedores + i * 6)} />
          ))}
        </div>
        <Chip
          icono="moneda"
          texto="Tú decides qué se gasta"
          p={entrada(f, tDecides)}
          activo={tramo(f, tDecides + 4, tDecides + 16)}
          degradado={DEGRADADO.chispa}
          style={{ marginTop: 18 }}
        />
      </div>
      <div style={{ position: "absolute", left: 1000, top: 150, ...aparecer(vent, 50) }}>
        <Ventana
          captura="0.9.0-credenciales-claro.webp"
          region={{ x: 0, y: 0, w: 832, h: 750 }}
          regionFinal={{ x: 40, y: 20, w: 760, h: 620 }}
          zoom={zoom}
          ancho={820}
          alto={700}
          titulo="Escenara · Tu cuenta"
          claro
        />
      </div>
    </AbsoluteFill>
  );
};

export const Escena03: React.FC<PropsEscena> = ({ escena, fps }) => {
  const f = useCurrentFrame();
  const d = dur(escena, fps);
  const tFotos = cuandoDice(escena, "fotos", fps);
  const tConsentimiento = cuandoDice(escena, "consentimiento", fps);
  const tFicha = cuandoDice(escena, "ficha", fps);
  const tInventa = cuandoDice(escena, "inventalo", fps);
  const v1 = entrada(f, 8, 22);
  const v2 = entrada(f, tFicha - 2, 22);
  const inventa = entrada(f, tInventa, 20);
  return (
    <AbsoluteFill style={{ opacity: salida(f, d) }}>
      <Rotulo
        numero="03"
        capitulo="Tu personaje"
        titular="Empieza por tu personaje"
        resaltar={["personaje"]}
        desde={4}
        ancho={720}
        style={{ position: "absolute", left: 96, top: 150 }}
      />
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 470,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 20,
        }}
      >
        <Chip icono="camara" texto="Tus fotos" p={entrada(f, tFotos)} />
        <Chip
          icono="escudo"
          texto="Con su consentimiento"
          p={entrada(f, tConsentimiento)}
          activo={tramo(f, tConsentimiento, tConsentimiento + 10)}
        />
        <Chip icono="persona" texto="Una ficha que recuerda cómo es" p={entrada(f, tFicha)} />
      </div>
      <div style={{ position: "absolute", left: 880, top: 150, opacity: 1 - inventa * 0.75, ...aparecer(v1, 50) }}>
        <Ventana
          captura="0.13.0-personaje-claro.webp"
          region={{ x: 500, y: 60, w: 920, h: 560 }}
          regionFinal={{ x: 520, y: 330, w: 880, h: 535 }}
          zoom={tramo(f, tFotos, tConsentimiento + 20)}
          ancho={940}
          alto={600}
          titulo="Escenara · Personajes"
          claro
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 1010,
          top: 330,
          opacity: v2 * (1 - inventa * 0.75),
          transform: `translateX(${(1 - v2) * 120}px)`,
        }}
      >
        <Ventana
          captura="0.15.0-ficha-claro.webp"
          region={{ x: 530, y: 690, w: 880, h: 337 }}
          ancho={820}
          alto={360}
          titulo="Escenara · Ficha del personaje"
          claro
        />
      </div>
      {/* «O invéntalo desde cero»: silueta vacía que se ilumina */}
      <div style={{ position: "absolute", left: 1180, top: 200, ...aparecer(inventa, 60) }}>
        <Tarjeta
          p={1}
          ancho={440}
          style={{ textAlign: "center", border: `2px dashed ${COLOR.chispa}`, background: "rgba(23,27,39,0.95)" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              position: "relative",
              height: 300,
              alignItems: "center",
            }}
          >
            <Icono nombre="persona" tam={230} color={COLOR.borde} grosor={1.2} />
            <div
              style={{
                position: "absolute",
                top: 30,
                right: 80,
                transform: `scale(${0.6 + inventa * 0.6}) rotate(${inventa * 90}deg)`,
              }}
            >
              <Icono nombre="chispa" tam={80} color={COLOR.chispa} />
            </div>
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, marginTop: 8 }}>O invéntalo desde cero</div>
        </Tarjeta>
      </div>
    </AbsoluteFill>
  );
};

// Posiciones (px de origen) de los botones del menú real de 0.49.0
const MENU = { productos: { x: 395, w: 90 }, lugares: { x: 497, w: 75 } };

export const Escena04: React.FC<PropsEscena> = ({ escena, fps }) => {
  const f = useCurrentFrame();
  const d = dur(escena, fps);
  const tProducto = cuandoDice(escena, "producto", fps);
  const tLugar = cuandoDice(escena, "lugar", fps);
  const menu = entrada(f, 6, 20);
  const vent = entrada(f, tLugar - 6, 22);
  const escala = 1.3; // menú de 1280 px mostrado a 1664 px
  const anillo = (m: { x: number; w: number }, desde: number) => {
    const p = entrada(f, desde, 14);
    return (
      <div
        style={{
          position: "absolute",
          left: m.x * escala - 10,
          top: 60 * escala - 6,
          width: m.w * escala + 20,
          height: 60 * escala,
          borderRadius: 999,
          border: `4px solid ${COLOR.chispa}`,
          boxShadow: `0 0 30px ${COLOR.coral}`,
          opacity: p,
          transform: `scale(${1.3 - p * 0.3})`,
        }}
      />
    );
  };
  return (
    <AbsoluteFill style={{ opacity: salida(f, d) }}>
      <Rotulo
        numero="04"
        capitulo="Producto y lugar"
        titular="Tu producto, en un lugar concreto"
        resaltar={["producto", "lugar"]}
        desde={2}
        ancho={760}
        tam={68}
        style={{ position: "absolute", left: 96, top: 150 }}
      />
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 440,
          display: "flex",
          flexDirection: "column",
          gap: 20,
          alignItems: "flex-start",
        }}
      >
        <Chip icono="caja" texto="Tu producto" p={entrada(f, tProducto)} activo={tramo(f, tProducto, tProducto + 10)} />
        <Chip
          icono="lugar"
          texto="Un lugar concreto"
          p={entrada(f, tLugar)}
          activo={tramo(f, tLugar, tLugar + 10)}
          degradado={DEGRADADO.chispa}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 128,
          top: 660,
          width: 1664,
          height: 127 * escala,
          overflow: "visible",
          ...aparecer(menu, 30),
        }}
      >
        <div style={{ borderRadius: 20, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
          <Recorte
            captura="0.49.0-menu-claro.webp"
            region={entera("0.49.0-menu-claro.webp")}
            ancho={1664}
            alto={127 * escala}
            radio={0}
          />
        </div>
        {anillo(MENU.productos, tProducto)}
        {anillo(MENU.lugares, tLugar)}
      </div>
      <div style={{ position: "absolute", left: 960, top: 130, ...aparecer(vent, 50) }}>
        <Ventana
          captura="0.49.0-lugar-ficha-oscuro.webp"
          region={{ x: 180, y: 140, w: 1000, h: 560 }}
          regionFinal={{ x: 200, y: 180, w: 900, h: 500 }}
          zoom={tramo(f, tLugar, d)}
          ancho={860}
          alto={560}
          titulo="Escenara · Lugares"
        />
      </div>
    </AbsoluteFill>
  );
};
