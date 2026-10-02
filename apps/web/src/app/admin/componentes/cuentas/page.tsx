import { Catalogo } from "../catalogo";
import { SeccionCuentas } from "../secciones/cuentas";

export const metadata = { title: "Cuentas · Componentes" };
export default function Pagina() {
  return (
    <Catalogo actual="cuentas">
      <SeccionCuentas />
    </Catalogo>
  );
}
