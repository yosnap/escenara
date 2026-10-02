import { Catalogo } from "../catalogo";
import { SeccionTokens } from "../secciones/tokens";

export const metadata = { title: "Colores y tipografía · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="tokens">
      <SeccionTokens />
    </Catalogo>
  );
}
