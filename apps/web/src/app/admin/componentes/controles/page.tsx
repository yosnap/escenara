import { Catalogo } from "../catalogo";
import { SeccionControles } from "../secciones/controles";

export const metadata = { title: "Controles previos · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="controles">
      <SeccionControles />
    </Catalogo>
  );
}
