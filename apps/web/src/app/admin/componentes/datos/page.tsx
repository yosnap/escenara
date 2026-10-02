import { Catalogo } from "../catalogo";
import { SeccionDatos } from "../secciones/datos";

export const metadata = { title: "Tus datos · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="datos">
      <SeccionDatos />
    </Catalogo>
  );
}
