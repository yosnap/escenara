import { Catalogo } from "../catalogo";
import { SeccionDireccion } from "../secciones/direccion";

export const metadata = { title: "Dirección del clip · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="direccion">
      <SeccionDireccion />
    </Catalogo>
  );
}
