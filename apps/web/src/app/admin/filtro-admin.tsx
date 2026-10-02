import { estiloCampoAdmin } from "./estilos-admin";
import { SelectorAdmin as Selector } from "./selector-admin";

export function FiltroAdmin({
  nombre,
  etiqueta,
  valor,
  opciones,
}: {
  nombre: string;
  etiqueta: string;
  valor?: string;
  opciones?: readonly string[];
}) {
  if (opciones)
    return (
      <Selector
        etiqueta={etiqueta}
        nombre={nombre}
        valorInicial={valor || null}
        marcador="Todos"
        className="w-full min-w-0 sm:w-56"
        opciones={[
          { value: "", label: "Todos" },
          ...opciones.map((o) => ({
            value: o,
            label: ({ user: "Usuario", admin: "Administrador", si: "Sí", no: "No" } as Record<string, string>)[o] ?? o,
          })),
        ]}
      />
    );
  return (
    <label className="flex w-full min-w-0 flex-col gap-1 text-sm sm:w-80">
      {etiqueta}
      <input name={nombre} defaultValue={valor ?? ""} maxLength={100} className={estiloCampoAdmin} />
    </label>
  );
}
