import { Catalogo } from "../catalogo";
import { SeccionComparativas } from "../secciones/comparativas";

export const metadata = { title: "Comparativas y calibración · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="comparativas">
      <SeccionComparativas />
    </Catalogo>
  );
}
