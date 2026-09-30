// Composiciones: el vídeo con subtítulos incrustados, sin ellos y la miniatura.
// La duración sale de tiempos.json (generado por scripts/audio.mjs).
import { type CalculateMetadataFunction, Composition, Still, staticFile } from "remotion";
import { ALTO, ANCHO, cargarFuentes } from "./marca";
import { Miniatura } from "./miniatura";
import { Presentacion, type PropsPresentacion } from "./presentacion";
import { validarTiempos } from "./tiempos";

// Manrope se carga en cada pestaña de render (loadFont retrasa el render hasta tenerla)
void cargarFuentes();

const calcular: CalculateMetadataFunction<PropsPresentacion> = async ({ props }) => {
  await cargarFuentes();
  const r = await fetch(staticFile("tiempos.json"));
  if (!r.ok) throw new Error(`No se pudo leer tiempos.json (${r.status}): ejecuta npm run audio`);
  const tiempos = validarTiempos(await r.json());
  return { durationInFrames: tiempos.totalCuadros, fps: tiempos.fps, props: { ...props, tiempos } };
};

export const Raiz: React.FC = () => (
  <>
    <Composition
      id="Presentacion"
      component={Presentacion}
      width={ANCHO}
      height={ALTO}
      fps={30}
      durationInFrames={30}
      defaultProps={{ subtitulos: true, tiempos: null }}
      calculateMetadata={calcular}
    />
    <Composition
      id="PresentacionSinSubtitulos"
      component={Presentacion}
      width={ANCHO}
      height={ALTO}
      fps={30}
      durationInFrames={30}
      defaultProps={{ subtitulos: false, tiempos: null }}
      calculateMetadata={calcular}
    />
    <Still
      id="Miniatura"
      component={Miniatura}
      width={1280}
      height={720}
      calculateMetadata={async () => {
        await cargarFuentes();
        return {};
      }}
    />
  </>
);
