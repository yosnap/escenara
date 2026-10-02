import { Catalogo } from "../catalogo";
import { SeccionSuperposiciones } from "../secciones/superposiciones";

export const metadata = { title: "Diálogos y pestañas · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="superposiciones">
      <SeccionSuperposiciones />
    </Catalogo>
  );
}
