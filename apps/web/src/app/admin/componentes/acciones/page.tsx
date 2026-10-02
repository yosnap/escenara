import { Catalogo } from "../catalogo";
import { SeccionAcciones } from "../secciones/acciones";

export const metadata = { title: "Botones · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="acciones">
      <SeccionAcciones />
    </Catalogo>
  );
}
