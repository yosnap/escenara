import { Catalogo } from "../catalogo";
import { SeccionConversion } from "../secciones/conversion";

export const metadata = { title: "De Crear a un proyecto · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="conversion">
      <SeccionConversion />
    </Catalogo>
  );
}
