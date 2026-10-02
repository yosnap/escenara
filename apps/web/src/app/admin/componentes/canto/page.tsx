import { Catalogo } from "../catalogo";
import { SeccionCanto } from "../secciones/canto";

export const metadata = { title: "Cantar con audio propio · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="canto">
      <SeccionCanto />
    </Catalogo>
  );
}
