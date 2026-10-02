import { Catalogo } from "../catalogo";
import { SeccionComunidad } from "../secciones/comunidad";

export const metadata = { title: "Comunidad · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="comunidad">
      <SeccionComunidad />
    </Catalogo>
  );
}
