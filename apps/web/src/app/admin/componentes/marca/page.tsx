import { Catalogo } from "../catalogo";
import { SeccionMarca } from "../secciones/marca";

export const metadata = { title: "Marca y kit · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="marca">
      <SeccionMarca />
    </Catalogo>
  );
}
