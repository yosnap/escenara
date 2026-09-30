import { History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alerta } from "@/components/ui/alerta";
import { claseBoton } from "@/components/ui/button";
import { AvisoEstado } from "@/components/ui/feedback";
import { AVISO_BOVEDA_USUARIO, PROVEEDORES_PUBLICOS } from "@/lib/boveda";
import { evaluacionFallida } from "@/lib/controles";
import { pasoDeLaUrl } from "@/lib/multipaso";
import { IDS_PASOS_CREAR } from "@/lib/pasos-crear";
import type { CatalogoParaCrear } from "@/lib/presets";
import { esAdmin, exigirSesion } from "@/server/auth/sesion";
import { bovedaDisponible } from "@/server/boveda/cifrado";
import { listarCredenciales } from "@/server/boveda/credenciales";
import { estadoDeCola } from "@/server/cola/latido";
import { publicacionVisible } from "@/server/comunidad/consulta";
import { evaluarControles } from "@/server/controles/consulta";
import { REGLAS_VERSION } from "@/server/controles/contrato";
import { estimarTodo } from "@/server/generacion/estimacion";
import { personajesElegibles } from "@/server/personajes/consulta";
import { contextoAplicado } from "@/server/personajes/contexto";
import { depositoDe } from "@/server/presupuesto/deposito";
import { modelosParaCrearConFoto } from "@/server/productos/modelos-sugeridos";
import { catalogoParaCrear } from "@/server/prompts/catalogo-para-crear";
import { modelosParaCrear } from "@/server/proveedores/catalogo";
import { CabeceraApp } from "../_app/cabecera-app";
import { VistaCrear } from "./_componentes/vista-crear";

export const metadata: Metadata = { title: "Crear" };
export const dynamic = "force-dynamic";

/**
 * «Crear»: el primer flujo usable. Cada usuario genera con su propia clave de KIE (RF01) y paga en su
 * cuenta del proveedor. Sin clave utilizable no se muestra el formulario: se explica qué falta.
 */
export default async function PaginaCrear({
  searchParams,
}: {
  searchParams: Promise<{ personaje?: string; paso?: string | string[]; plantilla?: string; desde?: string }>;
}) {
  const sesion = await exigirSesion("/crear");
  // Preselección al llegar desde la ficha de un personaje. Solo es una sugerencia de la interfaz: quien
  // autoriza el uso de ese personaje es el servidor, al encolar. `paso` es el paso que estaba abierto (0.33.0):
  // solo se acepta si es uno de los de «Crear».
  const { personaje: personajePedido, paso, plantilla: plantillaPedida, desde } = await searchParams;
  const pasoPedido = pasoDeLaUrl(paso, IDS_PASOS_CREAR);
  const boveda = bovedaDisponible();
  const credenciales = boveda ? await listarCredenciales(sesion.user.id) : [];
  const kie = credenciales.find((c) => c.proveedor === "kie") ?? null;
  const puedeGenerar = Boolean(kie && kie.estado === "valida");
  // La estimación no necesita credencial (el saldo se queda en `null`): así el coste se ve siempre.
  /**
   * Al cargar «Crear» todavía no hay ninguna imagen elegida, salvo que se llegue desde la ficha de un
   * personaje. Así que la estimación del fotograma se pide **como se va a generar**: sin imagen de partida, con
   * el modelo de texto a imagen (0.23.4). Al elegir personaje o foto se vuelve a pedir con el de edición.
   */
  const sinImagenAlCargar = !personajePedido;
  const [
    estimaciones,
    modelosFotograma,
    modelosSinImagen,
    modelosClip,
    deposito,
    cola,
    personajes,
    catalogoFoto,
    catalogoClip,
  ] = puedeGenerar
    ? await Promise.all([
        estimarTodo(sesion.user.id, undefined, {}, { fotograma: { sinReferencia: sinImagenAlCargar } }),
        modelosParaCrear("image_edit"),
        modelosParaCrear("text_to_image"),
        modelosParaCrearConFoto("image_to_video"),
        depositoDe(sesion.user.id),
        estadoDeCola(sesion.user.id),
        personajesElegibles({ id: sesion.user.id, esAdmin: esAdmin(sesion) }),
        // Presets y plantillas con el modelo predeterminado de cada capacidad: así la botonera está pintada
        // al cargar la página, sin efectos en el navegador.
        catalogoParaCrear(sesion.user.id, "fotograma", null, { sinReferencia: sinImagenAlCargar }),
        catalogoParaCrear(sesion.user.id, "animacion"),
      ])
    : [null, [], [], [], null, null, [], null, null];

  // Llegando desde la comunidad («Usar») o un reto, la plantilla pedida se pone la primera: es la que «Crear» elige al
  // abrir. Solo si este usuario puede usarla (está en su catálogo); si no, se ignora sin más.
  const catalogoFotoInicial = conPlantillaPrimero(catalogoFoto, plantillaPedida);
  const catalogoClipInicial = conPlantillaPrimero(catalogoClip, plantillaPedida);
  const atribucion = desde && /^[0-9a-f-]{36}$/i.test(desde) ? await publicacionVisible(desde).catch(() => null) : null;

  // Llegando desde la ficha con un personaje preseleccionado, el contexto se resuelve **aquí**: así la zona de
  // claridad ya está rellena al cargar la página, sin efectos en el navegador.
  const personajeInicial = personajes.some((p) => p.id === personajePedido && p.estado === "listo")
    ? (personajePedido ?? null)
    : null;
  const contextoInicial =
    personajeInicial && estimaciones
      ? await contextoAplicado(
          { id: sesion.user.id, esAdmin: esAdmin(sesion) },
          personajeInicial,
          estimaciones.fotograma.modelo,
        ).catch(() => null)
      : null;

  /**
   * Controles previos ya evaluados **aquí** (0.18.0): la zona de claridad «Antes de generar» está rellena al
   * cargar la página, sin efectos en el navegador. Es una lectura: no encola nada ni mueve presupuesto.
   *
   * Si la evaluación falla, **no se muestra «Listo»**: se muestra «Requiere revisión» con el motivo, y el botón
   * queda deshabilitado. No saber si se puede gastar no es lo mismo que poder, y un panel en verde por un error
   * sería la mentira que invita a pulsar.
   */
  const controlesIniciales = estimaciones
    ? await evaluarControles(
        { id: sesion.user.id, esAdmin: esAdmin(sesion) },
        { tipo: "fotograma", modelo: estimaciones.fotograma.modelo, personajeId: personajeInicial },
      ).catch((error: unknown) => {
        console.error("[controles] no se ha podido evaluar al cargar «Crear»:", error);
        return evaluacionFallida(REGLAS_VERSION);
      })
    : null;

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" tabIndex={-1} className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-8 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-4xl font-bold text-texto">Crear</h1>
            <p className="mt-2 max-w-2xl text-texto-suave">
              Elige una imagen, describe la escena y genera un fotograma vertical y un clip corto con tu propia clave de{" "}
              {PROVEEDORES_PUBLICOS.kie.nombre}. Nada se envía sin que veas antes el coste estimado, y los trabajos
              siguen en la cola del servidor aunque cierres el navegador.
            </p>
          </div>
          <Link href="/crear/historial" className={claseBoton("secundario", "sm")}>
            <History className="size-4" aria-hidden /> Historial
          </Link>
        </div>

        {!boveda && <AvisoEstado estado="bloqueado" motivo={AVISO_BOVEDA_USUARIO} />}

        {boveda && !puedeGenerar && (
          <AvisoEstado
            estado="bloqueado"
            motivo={
              kie
                ? "Tu clave de KIE está marcada como no válida. Pruébala o sustitúyela en «Tu cuenta» y vuelve aquí."
                : "Para generar necesitas tu propia clave de KIE.ai: tú pagas al proveedor y nadie más usa tu saldo. Añádela en «Tu cuenta»."
            }
            accion={
              <Link href="/cuenta" className={claseBoton("primario", "sm")}>
                Ir a Tu cuenta
              </Link>
            }
          />
        )}

        {atribucion?.plantilla && atribucion.plantillaId === plantillaPedida && (
          <Alerta tipo="info" anuncio="ninguno" titulo={`Usas «${atribucion.plantilla.nombre}» de la comunidad`}>
            Tal como lo compartió {atribucion.firma} en «{atribucion.titulo}». Tu resultado es tuyo y privado: solo se
            publica si tú lo decides.
          </Alerta>
        )}

        {estimaciones && deposito && cola && catalogoFotoInicial && catalogoClipInicial && controlesIniciales && (
          <VistaCrear
            estimacionFotograma={estimaciones.fotograma}
            estimacionAnimacion={estimaciones.animacion}
            modelosFotograma={modelosFotograma}
            modelosSinImagen={modelosSinImagen}
            modelosClip={modelosClip}
            deposito={deposito}
            cola={cola}
            personajes={personajes}
            personajeInicial={personajeInicial}
            contextoInicial={contextoInicial}
            catalogoFotogramaInicial={catalogoFotoInicial}
            catalogoClipInicial={catalogoClipInicial}
            controlesIniciales={controlesIniciales}
            pasoPedido={pasoPedido}
          />
        )}
      </main>
    </div>
  );
}

/** El catálogo con la plantilla pedida delante (si está en él). Sin plantilla pedida, el mismo catálogo. */
function conPlantillaPrimero(catalogo: CatalogoParaCrear | null, id: string | undefined): CatalogoParaCrear | null {
  if (!catalogo || !id) return catalogo;
  const pedida = catalogo.plantillas.find((p) => p.id === id);
  return pedida ? { ...catalogo, plantillas: [pedida, ...catalogo.plantillas.filter((p) => p.id !== id)] } : catalogo;
}
