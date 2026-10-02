import { Catalogo } from "../catalogo";
import { SeccionLugares } from "../secciones/lugares";

export const metadata = { title: "Lugares · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="lugares">
      <SeccionLugares />
    </Catalogo>
  );
}
