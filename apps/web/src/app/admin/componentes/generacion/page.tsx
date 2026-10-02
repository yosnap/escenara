import { Catalogo } from "../catalogo";
import { SeccionGeneracion } from "../secciones/generacion";

export const metadata = { title: "Coste y trabajos · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="generacion">
      <SeccionGeneracion />
    </Catalogo>
  );
}
