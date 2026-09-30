"use client";

import { useState } from "react";
import { Alerta, FlechaProblema } from "@/components/ui/alerta";
import { Casilla } from "@/components/ui/choice";
import { AreaTexto, Campo } from "@/components/ui/field";
import { Multipaso, PanelDePaso, useMultipaso } from "@/components/ui/multipaso";
import { Paso } from "@/components/ui/paso";
import type { PasoDelFlujo } from "@/lib/multipaso";
import { Muestra, Seccion } from "../seccion";

/**
 * **Alertas**: el componente único para bloqueos, errores y avisos (y la confirmación de que algo salió bien). Aquí se
 * ven sus tipos y estados y cómo lleva al problema, también a otro paso de un flujo.
 */
export function SeccionAlertas() {
  const [texto, setTexto] = useState("");
  const [derechos, setDerechos] = useState(false);
  const faltaTexto = texto.trim().length < 10;
  const pasos: PasoDelFlujo[] = [
    { id: "escena", titulo: "Describe la escena", corto: "Escena", estado: faltaTexto ? "en-curso" : "hecho" },
    { id: "coste", titulo: "Revisa el coste y confirma", corto: "Coste", estado: "pendiente" },
  ];
  // La muestra no escribe `?paso=` en la dirección: el catálogo no es una pantalla de trabajo.
  const control = useMultipaso(pasos, "escena", false);
  const elementos = [
    ...(faltaTexto
      ? [{ id: "alerta-demo-descripcion", paso: "escena", texto: "Falta describir la escena (mínimo 10 caracteres)." }]
      : []),
    ...(derechos
      ? []
      : [{ id: "alerta-demo-derechos", paso: "coste", texto: "Falta confirmar que tienes derecho a usar la imagen." }]),
  ];

  return (
    <Seccion
      id="alertas"
      titulo="Alertas"
      descripcion="Un solo componente para todo lo que hay que decir: bloqueo (rojo, impide seguir), error (rojo, algo ha fallado), aviso (ámbar, pide atención sin bloquear) e información (azul de marca), y «hecho» para confirmar. Borde completo, icono y rótulo en texto; bloqueos y errores persisten hasta resolverse y lo que protege dinero o consentimiento nunca se descarta. Al pulsar un problema, la pantalla cambia de paso si hace falta, se desplaza, lo enfoca, lo resalta con un aro de marca y lo señala con una flecha."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Muestra titulo="Los cuatro tipos">
          <div className="flex w-full flex-col gap-3">
            <Alerta tipo="bloqueo" titulo="No se puede generar todavía">
              Falta tu clave de KIE. Añádela en Cuenta › Proveedores; no se ha cobrado nada.
            </Alerta>
            <Alerta tipo="error" titulo="KIE ha rechazado la imagen">
              El proveedor dice que la imagen no cumple su política. No se ha cobrado: cambia la foto y vuelve a
              intentarlo.
            </Alerta>
            <Alerta tipo="aviso" titulo="Precio comprobado hace tres días">
              La estimación puede haber cambiado un poco; se vuelve a comprobar al confirmar.
            </Alerta>
            <Alerta tipo="info" titulo="Se está generando la vista">
              Cuando termine aparecerá en la ficha como vista generada. Puedes seguir trabajando.
            </Alerta>
          </div>
        </Muestra>
        <Muestra titulo="Descartable, protegido, compacta y hecho">
          <div className="flex w-full flex-col gap-3">
            <Alerta tipo="info" descartable>
              Nota que se puede cerrar con la X (hoy solo en este catálogo).
            </Alerta>
            <Alerta tipo="aviso" descartable protege titulo="Este trabajo pasa del aviso de gasto">
              Protege tu dinero: aunque se pida descartable, no se cierra hasta aceptarlo.
            </Alerta>
            <Alerta tipo="error" compacta>
              Versión compacta dentro de un formulario o un diálogo.
            </Alerta>
            <Alerta tipo="hecho" compacta>
              Guardado. Los cambios ya se ven en tu ficha.
            </Alerta>
          </div>
        </Muestra>
      </div>
      <div className="h-6" />
      <Muestra titulo="Varios problemas en un flujo por pasos (pulsa uno o «Ir al primero»)">
        <div className="flex w-full flex-col gap-4">
          <Multipaso etiqueta="Pasos de ejemplo con alertas" pasos={pasos} control={control}>
            {elementos.length > 0 && (
              <Alerta
                tipo="bloqueo"
                titulo="Antes de generar, falta:"
                elementos={elementos}
                anuncio="ninguno"
                protege
              />
            )}
            <PanelDePaso id="escena">
              <Paso numero={1} titulo="Describe la escena">
                <Campo
                  etiqueta="Qué quieres ver"
                  requisito="alerta-demo-descripcion"
                  error={faltaTexto ? "Falta describir la escena (mínimo 10 caracteres)." : undefined}
                >
                  {(props) => <AreaTexto {...props} value={texto} onChange={(e) => setTexto(e.target.value)} />}
                </Campo>
              </Paso>
            </PanelDePaso>
            <PanelDePaso id="coste">
              <Paso numero={2} titulo="Revisa el coste y confirma">
                <Casilla
                  etiqueta="Tengo derecho a usar esta imagen"
                  marcada={derechos}
                  onCambio={setDerechos}
                  requisito="alerta-demo-derechos"
                  error={derechos ? undefined : "Falta confirmar que tienes derecho a usar la imagen."}
                />
              </Paso>
            </PanelDePaso>
          </Multipaso>
        </div>
      </Muestra>
      <div className="h-6" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Muestra titulo="Con acción «Ir al campo»">
          <div className="flex w-full flex-col gap-3">
            <Alerta tipo="error" destino={{ id: "alerta-demo-nombre", texto: "Falta el nombre." }}>
              El nombre del producto es obligatorio para guardarlo.
            </Alerta>
            <Campo etiqueta="Nombre del producto" requisito="alerta-demo-nombre">
              {(props) => (
                <input {...props} className="min-h-11 rounded-control border border-borde bg-superficie px-3" />
              )}
            </Campo>
          </div>
        </Muestra>
        <Muestra titulo="Flecha: con movimiento y con «reducir movimiento»">
          <div className="flex items-center gap-8">
            <div className="flex flex-col items-center gap-2">
              <FlechaProblema />
              <span className="text-sm text-texto-suave">Rebota hacia el bloque</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <FlechaProblema animada={false} />
              <span className="text-sm text-texto-suave">Quieta (reducir movimiento)</span>
            </div>
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
