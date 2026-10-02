import { Catalogo } from "../catalogo";
import { SeccionSelectores } from "../secciones/selectores";

export const metadata = { title: "Selectores · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="selectores">
      <SeccionSelectores />
    </Catalogo>
  );
}
