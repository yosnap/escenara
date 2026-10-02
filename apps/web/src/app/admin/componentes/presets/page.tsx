import { Catalogo } from "../catalogo";
import { SeccionPresets } from "../secciones/presets";

export const metadata = { title: "Presets y prompt · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="presets">
      <SeccionPresets />
    </Catalogo>
  );
}
