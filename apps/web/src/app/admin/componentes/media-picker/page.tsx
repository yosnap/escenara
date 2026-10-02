import { Catalogo } from "../catalogo";
import { SeccionMediaPicker } from "../secciones/media-picker";

export const metadata = { title: "Selector de medios · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="media-picker">
      <SeccionMediaPicker />
    </Catalogo>
  );
}
