import { Catalogo } from "../catalogo";
import { SeccionEstados } from "../secciones/estados";

export const metadata = { title: "Estados y presupuesto · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="estados">
      <SeccionEstados />
    </Catalogo>
  );
}
