import { Catalogo } from "../catalogo";
import { SeccionProductos } from "../secciones/productos";

export const metadata = { title: "Producto y acción · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="productos">
      <SeccionProductos />
    </Catalogo>
  );
}
