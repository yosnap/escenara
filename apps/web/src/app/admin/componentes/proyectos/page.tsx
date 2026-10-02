import { Catalogo } from "../catalogo";
import { SeccionProyectos } from "../secciones/proyectos";

export const metadata = { title: "Proyectos y plan · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="proyectos">
      <SeccionProyectos />
    </Catalogo>
  );
}
