import { Catalogo } from "../catalogo";
import { SeccionCreador } from "../secciones/creador";

export const metadata = { title: "Creador · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="creador">
      <SeccionCreador />
    </Catalogo>
  );
}
