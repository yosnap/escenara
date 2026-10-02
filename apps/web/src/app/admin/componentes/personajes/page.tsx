import { Catalogo } from "../catalogo";
import { SeccionPersonajes } from "../secciones/personajes";

export const metadata = { title: "Personajes · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="personajes">
      <SeccionPersonajes />
    </Catalogo>
  );
}
