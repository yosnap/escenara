import { Catalogo } from "../catalogo";
import { SeccionAlertas } from "../secciones/alertas";

export const metadata = { title: "Alertas · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="alertas">
      <SeccionAlertas />
    </Catalogo>
  );
}
