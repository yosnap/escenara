import { Catalogo } from "../catalogo";
import { SeccionReparto } from "../secciones/reparto";

export const metadata = { title: "Dos personajes · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="reparto">
      <SeccionReparto />
    </Catalogo>
  );
}
