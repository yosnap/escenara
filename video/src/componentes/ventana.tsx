// Marco de ventana de navegador con una captura real dentro. La captura se
// encuadra en una región (en píxeles de origen) y puede desplazarse hacia otra
// región para simular un zoom de cámara, sin deformar la imagen.
import { Img, interpolate, staticFile } from "remotion";
import { CAPTURAS, type NombreCaptura, type Region } from "../capturas";
import { COLOR, FUENTE } from "../marca";

type Props = {
  captura: NombreCaptura;
  region: Region;
  regionFinal?: Region;
  /** 0 → region, 1 → regionFinal */
  zoom?: number;
  ancho: number;
  alto: number;
  titulo?: string;
  claro?: boolean;
  style?: React.CSSProperties;
};

const BARRA = 44;

const mezclar = (a: Region, b: Region, t: number): Region => ({
  x: interpolate(t, [0, 1], [a.x, b.x]),
  y: interpolate(t, [0, 1], [a.y, b.y]),
  w: interpolate(t, [0, 1], [a.w, b.w]),
  h: interpolate(t, [0, 1], [a.h, b.h]),
});

export const Ventana: React.FC<Props> = ({
  captura,
  region,
  regionFinal,
  zoom = 0,
  ancho,
  alto,
  titulo = "Escenara",
  claro,
  style,
}) => {
  const origen = CAPTURAS[captura];
  const r = regionFinal ? mezclar(region, regionFinal, zoom) : region;
  const altoContenido = alto - BARRA;
  // «cover» sobre la región: llena la ventana y centra la región
  const escala = Math.max(ancho / r.w, altoContenido / r.h);
  const izquierda = ancho / 2 - (r.x + r.w / 2) * escala;
  const arriba = altoContenido / 2 - (r.y + r.h / 2) * escala;
  const fondoBarra = claro ? "#E9ECF4" : COLOR.elevada;
  return (
    <div
      style={{
        width: ancho,
        height: alto,
        borderRadius: 18,
        overflow: "hidden",
        background: claro ? "#F7F8FC" : COLOR.superficie,
        boxShadow: "0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)",
        ...style,
      }}
    >
      <div
        style={{
          height: BARRA,
          background: fondoBarra,
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "0 18px",
        }}
      >
        {["#FF6B6B", "#FFC83D", "#4ED08A"].map((c) => (
          <div key={c} style={{ width: 13, height: 13, borderRadius: "50%", background: c, opacity: 0.9 }} />
        ))}
        <div
          style={{
            marginLeft: 16,
            flex: 1,
            maxWidth: 420,
            height: 26,
            borderRadius: 8,
            background: claro ? "#FFFFFF" : COLOR.fondo,
            color: claro ? "#485269" : COLOR.textoSuave,
            fontFamily: FUENTE,
            fontSize: 15,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            paddingLeft: 12,
          }}
        >
          {titulo}
        </div>
      </div>
      <div style={{ position: "relative", width: ancho, height: altoContenido, overflow: "hidden" }}>
        <Img
          src={staticFile(`capturas/${captura}`)}
          style={{
            position: "absolute",
            left: izquierda,
            top: arriba,
            width: origen.w * escala,
            height: origen.h * escala,
            maxWidth: "none",
          }}
        />
      </div>
    </div>
  );
};

/** Recorte sin marco (p. ej. un fotograma de personaje dentro de una captura). */
export const Recorte: React.FC<{
  captura: NombreCaptura;
  region: Region;
  ancho: number;
  alto: number;
  radio?: number;
  style?: React.CSSProperties;
}> = ({ captura, region, ancho, alto, radio = 20, style }) => {
  const origen = CAPTURAS[captura];
  const escala = Math.max(ancho / region.w, alto / region.h);
  return (
    <div
      style={{ width: ancho, height: alto, borderRadius: radio, overflow: "hidden", position: "relative", ...style }}
    >
      <Img
        src={staticFile(`capturas/${captura}`)}
        style={{
          position: "absolute",
          left: ancho / 2 - (region.x + region.w / 2) * escala,
          top: alto / 2 - (region.y + region.h / 2) * escala,
          width: origen.w * escala,
          height: origen.h * escala,
          maxWidth: "none",
        }}
      />
    </div>
  );
};
