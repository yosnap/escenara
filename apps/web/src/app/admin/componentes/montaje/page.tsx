import { Catalogo } from "../catalogo";
import { SeccionMontaje } from "../secciones/montaje";

export const metadata = { title: "Montaje y exportación · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="montaje">
      <SeccionMontaje />
    </Catalogo>
  );
}
