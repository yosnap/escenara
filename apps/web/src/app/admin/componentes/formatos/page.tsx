import { Catalogo } from "../catalogo";
import { SeccionFormatos } from "../secciones/formatos";

export const metadata = { title: "Formatos, encuadre y versiones · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="formatos">
      <SeccionFormatos />
    </Catalogo>
  );
}
