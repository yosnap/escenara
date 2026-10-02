import { Catalogo } from "../catalogo";
import { SeccionFormularios } from "../secciones/formularios";

export const metadata = { title: "Campos y opciones · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="formularios">
      <SeccionFormularios />
    </Catalogo>
  );
}
