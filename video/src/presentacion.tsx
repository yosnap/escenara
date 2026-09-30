// Composición principal: fondo, escenas según tiempos.json, barra del flujo,
// cortinillas, subtítulos opcionales y la mezcla de audio final.
import { Audio } from "@remotion/media";
import { AbsoluteFill, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Fondo } from "./componentes/fondo";
import { BarraFlujo, Cortinilla, Subtitulos } from "./componentes/superposiciones";
import { Escena09, Escena10, Escena11 } from "./escenas/escenas-cierre";
import { Escena01, Escena02, Escena03, Escena04, type PropsEscena } from "./escenas/escenas-inicio";
import { Escena05, Escena06, Escena07, Escena08 } from "./escenas/escenas-medio";
import type { Tiempos } from "./tiempos";

export type PropsPresentacion = { subtitulos: boolean; tiempos: Tiempos | null };

const ESCENAS: Record<string, React.FC<PropsEscena>> = {
  "01": Escena01,
  "02": Escena02,
  "03": Escena03,
  "04": Escena04,
  "05": Escena05,
  "06": Escena06,
  "07": Escena07,
  "08": Escena08,
  "09": Escena09,
  "10": Escena10,
  "11": Escena11,
};

const FondoSegunEscena: React.FC<{ tiempos: Tiempos }> = ({ tiempos }) => {
  const t = useCurrentFrame() / tiempos.fps;
  const coste = tiempos.escenas.find((e) => e.id.startsWith("06"));
  if (!coste) throw new Error("tiempos.json sin la escena 06");
  // La escena de costes es una «zona de claridad»: fondo sobrio
  return <Fondo sobrio={t >= coste.inicio && t < coste.fin} />;
};

export const Presentacion: React.FC<PropsPresentacion> = ({ subtitulos, tiempos }) => {
  if (!tiempos) throw new Error("Faltan los tiempos: calculateMetadata no los cargó");
  const fps = tiempos.fps;
  return (
    <AbsoluteFill>
      <FondoSegunEscena tiempos={tiempos} />
      {tiempos.escenas.map((e) => {
        const Componente = ESCENAS[e.id.slice(0, 2)];
        if (!Componente) throw new Error(`Escena sin componente: ${e.id}`);
        const desde = Math.round(e.inicio * fps);
        return (
          <Sequence key={e.id} from={desde} durationInFrames={Math.round(e.fin * fps) - desde} name={e.id}>
            <Componente escena={e} fps={fps} />
          </Sequence>
        );
      })}
      <BarraFlujo tiempos={tiempos} />
      <Cortinilla tiempos={tiempos} />
      {subtitulos && <Subtitulos tiempos={tiempos} />}
      <Audio src={staticFile("mezcla.wav")} />
    </AbsoluteFill>
  );
};
