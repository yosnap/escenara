import { Catalogo } from "../catalogo";
import { SeccionRequisitos } from "../secciones/requisitos";

export const metadata = { title: "Requisitos pendientes · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="requisitos">
      <SeccionRequisitos />
    </Catalogo>
  );
}
