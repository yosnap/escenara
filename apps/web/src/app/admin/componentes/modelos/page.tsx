import { Catalogo } from "../catalogo";
import { SeccionModelos } from "../secciones/modelos";

export const metadata = { title: "Catálogo de modelos · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="modelos">
      <SeccionModelos />
    </Catalogo>
  );
}
