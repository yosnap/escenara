import { Catalogo } from "../catalogo";
import { SeccionPasos } from "../secciones/pasos";

export const metadata = { title: "Flujo por pasos · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="pasos">
      <SeccionPasos />
    </Catalogo>
  );
}
