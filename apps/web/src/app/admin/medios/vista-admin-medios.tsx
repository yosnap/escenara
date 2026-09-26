"use client";

import { useState } from "react";
import { Buscador } from "@/components/ui/combobox";
import { BibliotecaMedios } from "@/components/ui/media/biblioteca-medios";

interface Usuario {
  id: string;
  nombre: string;
  email: string;
}

export function VistaAdminMedios({ usuarios }: { usuarios: Usuario[] }) {
  const todos = { value: "todos", label: "Todos los usuarios" };
  const opciones = [todos, ...usuarios.map((u) => ({ value: u.id, label: u.nombre, descripcion: u.email }))];
  const [elegido, setElegido] = useState(todos);
  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-md">
        <Buscador
          etiqueta="Usuario"
          marcador="Busca por nombre"
          opciones={opciones}
          valor={elegido}
          onCambio={(o) => setElegido(o ?? todos)}
        />
      </div>
      <BibliotecaMedios key={elegido.value} propietario={elegido.value} permitirSubida={false} />
    </div>
  );
}
