// Tokens de marca tomados de docs/branding/escenara.brand.json (tema oscuro y
// capa vibrante «Escenario»). El vídeo usa el tema oscuro como base.
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

export const COLOR = {
  fondo: "#0D1018",
  superficie: "#171B27",
  elevada: "#222839",
  texto: "#F5F6FA",
  textoSuave: "#B8C0D1",
  borde: "#737F98",
  acento: "#8EB8FF",
  chispa: "#FFAD78",
  correcto: "#66D6AB",
  aviso: "#F5C97A",
  cobalto: "#7C9BFF",
  coral: "#FF8F6B",
  mandarina: "#FFA566",
  sol: "#FFD66B",
  fucsia: "#FF6FA8",
  cian: "#4FD3EE",
  // Variantes claras (más saturadas) para rellenos sobre oscuro
  cobaltoClaro: "#3D6BFF",
  coralClaro: "#F0663D",
  fucsiaClaro: "#E8458B",
} as const;

export const DEGRADADO = {
  escenario: `linear-gradient(100deg, ${COLOR.cobaltoClaro}, ${COLOR.fucsiaClaro} 40%, ${COLOR.coralClaro} 72%, ${COLOR.sol})`,
  chispa: `linear-gradient(100deg, ${COLOR.coral}, ${COLOR.sol})`,
  foco: `linear-gradient(100deg, ${COLOR.cobalto}, ${COLOR.cian})`,
  atardecer: `linear-gradient(100deg, ${COLOR.fucsia}, ${COLOR.mandarina})`,
} as const;

export const FUENTE = "Manrope, Inter, ui-sans-serif, system-ui, sans-serif";
export const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export const ANCHO = 1920;
export const ALTO = 1080;
export const MARGEN = 96;
// Banda inferior reservada a los subtítulos: el contenido no baja de aquí
export const LIMITE_INFERIOR = 900;

let cargadas: Promise<unknown> | null = null;
export function cargarFuentes() {
  cargadas ??= Promise.all(
    [400, 500, 600, 700, 800].map((peso) =>
      loadFont({
        family: "Manrope",
        url: staticFile(`fuentes/manrope-latin-${peso}-normal.woff2`),
        weight: String(peso),
      }),
    ),
  );
  return cargadas;
}
