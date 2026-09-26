import { Boton } from "@/components/ui/button";
import { AvisoEstado, DepositoPresupuesto, ProgresoEtapas } from "@/components/ui/feedback";
import { CargadorChispa } from "@/components/ui/motion";
import { Muestra, Seccion } from "../seccion";

export function SeccionEstados() {
  return (
    <Seccion
      id="estados"
      titulo="Estados y presupuesto"
      descripcion="Zonas de claridad: sin degradados ni animaciones decorativas. Siempre motivo y acción concreta; nunca porcentajes inventados."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Muestra titulo="Estados de preparación">
          <div className="flex w-full flex-col gap-3">
            <AvisoEstado
              estado="listo"
              motivo="Personaje, guion y presupuesto comprobados."
              accion={
                <Boton variante="chispa" tamano="sm">
                  Generar escena
                </Boton>
              }
            />
            <AvisoEstado
              estado="ajustes"
              motivo="Falta una foto lateral para mantener mejor el perfil del personaje."
              accion={
                <Boton variante="secundario" tamano="sm">
                  Añadir foto lateral
                </Boton>
              }
            />
            <AvisoEstado
              estado="revision"
              motivo="El guion afirma un beneficio de salud sin fuente."
              accion={
                <Boton variante="secundario" tamano="sm">
                  Añadir fuente
                </Boton>
              }
            />
            <AvisoEstado
              estado="bloqueado"
              motivo="El presupuesto disponible no cubre la estimación de esta escena."
              accion={
                <Boton variante="secundario" tamano="sm">
                  Ajustar presupuesto
                </Boton>
              }
            />
          </div>
        </Muestra>
        <div className="flex flex-col gap-4">
          <Muestra titulo="Depósito de presupuesto">
            <div className="w-full">
              <DepositoPresupuesto autorizado={5} gastado={1.84} reservado={0.9} />
            </div>
          </Muestra>
          <Muestra titulo="Progreso por etapas">
            <ProgresoEtapas
              etiqueta="Generación de la escena 2"
              etapas={[
                { nombre: "Fotograma clave aprobado", estado: "hecha" },
                { nombre: "Animando la escena", estado: "en-curso" },
                { nombre: "Revisión de continuidad", estado: "pendiente" },
              ]}
            />
          </Muestra>
          <Muestra titulo="Cargador">
            <CargadorChispa etiqueta="Preparando tu escena" />
          </Muestra>
        </div>
      </div>
    </Seccion>
  );
}
