import { Catalogo } from "../catalogo";
import { SeccionMovimiento } from "../secciones/movimiento";

export const metadata = { title: "Movimiento · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="movimiento">
      <SeccionMovimiento />
    </Catalogo>
  );
}
