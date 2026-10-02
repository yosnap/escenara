import { Catalogo } from "../catalogo";
import { SeccionSecretos } from "../secciones/secretos";

export const metadata = { title: "Secretos · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="secretos">
      <SeccionSecretos />
    </Catalogo>
  );
}
