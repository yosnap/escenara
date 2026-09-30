"use client";

import { Cronologia, type EventoVista, GastoPorMes } from "@/components/ui/datos/cronologia";
import { lineasBorradoCuenta } from "@/components/ui/datos/dialogo-borrar-cuenta";
import { lineasBorradoProyecto } from "@/components/ui/datos/dialogo-borrar-proyecto";
import { ExportarProyecto } from "@/components/ui/datos/exportar-proyecto";
import { Muestra, Seccion } from "../seccion";

/**
 * **Tus datos**: el historial (cronología y gasto por mes), la exportación del proyecto en sus estados y lo que
 * enumeran los diálogos de borrar un proyecto y la cuenta. Datos de ejemplo: aquí no hay proyectos de nadie, y los
 * botones que llaman al servidor no se pulsan desde el catálogo.
 */

const AHORA = "2026-09-30T10:00:00.000Z";
const base = {
  proyectoId: "ejemplo",
  proyectoTitulo: "Anuncio de otoño",
  proveedor: null,
  modelo: null,
  resultadoId: null,
};
const EVENTOS: EventoVista[] = [
  {
    ...base,
    tipo: "exportacion",
    id: "e1",
    fecha: AHORA,
    estado: "lista",
    clase: "zip",
    creditosEstimados: null,
    creditosConsumidos: null,
    fallo: null,
  },
  {
    ...base,
    tipo: "montaje",
    id: "e2",
    fecha: AHORA,
    estado: "listo",
    clase: "vertical_9_16",
    creditosEstimados: null,
    creditosConsumidos: null,
    fallo: null,
  },
  {
    ...base,
    tipo: "revision",
    id: "e3",
    fecha: AHORA,
    estado: "acepta",
    clase: "automatica",
    creditosEstimados: null,
    creditosConsumidos: 0,
    fallo: null,
  },
  {
    ...base,
    tipo: "trabajo",
    id: "e4",
    fecha: AHORA,
    estado: "fallido",
    clase: "animacion",
    proveedor: "kie",
    creditosEstimados: 30,
    creditosConsumidos: null,
    fallo: "El proveedor ha rechazado el contenido.",
  },
  {
    ...base,
    tipo: "trabajo",
    id: "e5",
    fecha: AHORA,
    estado: "listo",
    clase: "fotograma",
    proveedor: "kie",
    creditosEstimados: 10,
    creditosConsumidos: 8,
    fallo: null,
  },
];
const FILTRO = { tipo: null, mes: null, proyectoId: null, pagina: 1 };
const exportacion = (estado: "lista" | "fallida" | "preparando") => ({
  id: `x-${estado}`,
  estado,
  creadaEn: AHORA,
  terminadaEn: AHORA,
  caducaEn: "2026-10-01T10:00:00.000Z",
  bytes: 48_500_000,
  medios: 12,
  error:
    estado === "fallida"
      ? "El paquete pasaba de 2048 MB, el máximo de esta instalación, al añadir el archivo 9 de 12."
      : null,
  descarga: estado === "lista" ? "#" : null,
});

export function SeccionDatos() {
  const proyecto = lineasBorradoProyecto({
    titulo: "Anuncio de otoño",
    escenas: 4,
    trabajos: 11,
    trabajosEnMarcha: 0,
    trabajosPorCancelar: 1,
    generados: 9,
    generadosEnUsoFuera: 1,
    videosMontados: 2,
    paquetesExportados: 1,
    procesosEnCurso: 0,
  });
  const cuenta = lineasBorradoCuenta({
    proyectos: [{ id: "p", titulo: "Anuncio de otoño" }],
    personajes: 2,
    productos: 1,
    lugares: 1,
    medios: 64,
    bytes: 380_000_000,
    credenciales: 2,
    passkeys: 1,
    sesiones: 2,
    creditosConsumidos: 412,
    diasGracia: 7,
    unicoAdministrador: false,
  });
  return (
    <Seccion
      id="datos"
      titulo="Tus datos"
      descripcion="Historial con filtros y páginas por enlaces, exportación del proyecto en ZIP con su progreso y lo que enumeran los borrados antes de confirmar."
    >
      <div className="flex flex-col gap-8">
        <Muestra titulo="Cronología del historial (con el proyecto de cada cosa, como en la cuenta)">
          <Cronologia eventos={EVENTOS} base="/admin/componentes" filtro={FILTRO} hayMas conProyecto />
        </Muestra>
        <Muestra titulo="Gasto por mes y por proyecto: estimado al pedir y consumido de verdad">
          <GastoPorMes
            conProyecto
            filas={[
              {
                mes: "2026-09",
                proyectoId: "p",
                proyectoTitulo: "Anuncio de otoño",
                estimado: 120,
                consumido: 96,
                euros: 0.48,
              },
              { mes: "2026-09", proyectoId: null, proyectoTitulo: null, estimado: 20, consumido: 16, euros: 0.08 },
            ]}
          />
        </Muestra>
        <Muestra titulo="Exportar proyecto: listo, preparándose y fallido con su causa">
          <div className="flex flex-col gap-4">
            <ExportarProyecto proyectoId="ejemplo" inicial={exportacion("lista")} />
            <ExportarProyecto proyectoId="ejemplo" inicial={exportacion("fallida")} />
          </div>
        </Muestra>
        <Muestra titulo="Lo que enumera el diálogo de borrar un proyecto">
          <ul className="flex list-inside list-disc flex-col gap-1.5 text-texto">
            {/* alerta-permitida: ejemplo de lo que se borra, no un problema */}
            {[...proyecto.borra, ...proyecto.queda].map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Muestra>
        <Muestra titulo="Lo que enumera el diálogo de borrar la cuenta">
          <ul className="flex list-inside list-disc flex-col gap-1.5 text-texto">
            {/* alerta-permitida: ejemplo de lo que se borra, no un problema */}
            {cuenta.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Muestra>
      </div>
    </Seccion>
  );
}
