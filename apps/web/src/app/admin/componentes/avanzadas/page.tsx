import { Catalogo } from "../catalogo";
import { SeccionAvanzadas } from "../secciones/avanzadas";

export const metadata = { title: "Opciones avanzadas · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="avanzadas">
      <SeccionAvanzadas />
    </Catalogo>
  );
}
