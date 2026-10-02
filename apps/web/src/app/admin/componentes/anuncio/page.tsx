import { Catalogo } from "../catalogo";
import { SeccionAnuncio } from "../secciones/anuncio";

export const metadata = { title: "Estrategia del anuncio · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="anuncio">
      <SeccionAnuncio />
    </Catalogo>
  );
}
