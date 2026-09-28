import { esProveedor } from "@/lib/boveda";
import { esAccionVoz } from "@/lib/voz";
import { escenaPropia } from "@/server/asistente/consulta";
import { ErrorProyecto } from "@/server/asistente/errores";
import {
  type ContextoId,
  exigirMismoOrigen,
  exigirRitmoDeEscritura,
  leerCuerpo,
  leerId,
  manejador,
} from "@/server/asistente/http";
import { estadoDeVoz } from "@/server/voz/consulta";
import {
  leerConfirmacionVoz,
  leerConfirmadoInvalidar,
  leerConfirmadoSobrescribir,
  leerEleccionDeVoz,
  leerEscenaId,
  leerModoVoz,
  leerMusica,
  leerPistaId,
  leerSubtitulos,
  leerVolumen,
} from "@/server/voz/entrada";
import { anadirMusica, cambiarVolumenDeMusica, quitarMusica } from "@/server/voz/musica";
import { registrarVozOmni, validarEleccionVozOmni } from "@/server/voz/omni";
import { fijarModoVoz, fijarVoz } from "@/server/voz/proyecto";
import { guardarSubtitulos, proponerSubtitulos, transcribirEscena } from "@/server/voz/subtitulos";
import { generarVozDeEscena } from "@/server/voz/tts";

export const dynamic = "force-dynamic";

/**
 * Voz y subtítulos de un proyecto (RF08, 0.21.0). El GET es **lectura**: no genera nada, no transcribe nada y no
 * aparta presupuesto.
 */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) =>
  Response.json(await estadoDeVoz(actor, await leerId(contexto))),
);

/**
 * Acciones de la pantalla. Todas devuelven el estado completo, así que la pantalla nunca muestra algo que ya no sea
 * lo vigente.
 *
 * - `fijar-modo` y `fijar-voz`: cambian el proyecto **entero**. Si el cambio invalida escenas ya generadas, hace
 *   falta confirmarlo; no se regenera nada y no se cobra nada;
 * - `generar-voz`: **cuesta créditos**, así que exige la confirmación del coste con su sello y su clave;
 * - `transcribir` y `proponer-subtitulos`: **no cuestan nada** (el transcriptor es local);
 * - `guardar-subtitulos`: lo que la persona ha editado, que es lo único que se exporta;
 * - `anadir-musica`, `quitar-musica` y `volumen-musica`: no cuestan nada, y añadir exige la declaración de derechos.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  const cuerpo = await leerCuerpo(peticion);
  if (!esAccionVoz(cuerpo.accion)) throw new ErrorProyecto(400, "Esa acción de voz no existe.");
  await exigirRitmoDeEscritura(actor, `voz:${cuerpo.accion}`);
  const proyectoId = await leerId(contexto);

  switch (cuerpo.accion) {
    case "fijar-modo":
      await fijarModoVoz(actor, proyectoId, leerModoVoz(cuerpo), leerConfirmadoInvalidar(cuerpo));
      break;
    case "fijar-voz": {
      const eleccion = leerEleccionDeVoz(cuerpo);
      const { disponibilidad } = await estadoDeVoz(actor, proyectoId);
      if (!disponibilidad.ttsDisponible) throw new ErrorProyecto(503, disponibilidad.motivoTts);
      if (!esProveedor(disponibilidad.proveedor)) {
        throw new ErrorProyecto(503, disponibilidad.motivoTts || "Esta instalación no puede pagar la voz todavía.");
      }
      await fijarVoz(
        actor,
        proyectoId,
        /**
         * El proveedor y el modelo los decide el catálogo de esta instalación, **no la petición**: el navegador
         * elige la voz y sus mandos, no con qué servicio se paga. Se guarda **el proveedor de verdad** del modelo
         * elegido y no uno fijo: entra en la firma de la voz y en el panel, así que un valor inventado sería un
         * dato falso en la base y una firma que dice de quién es una voz que no es suya.
         */
        {
          proveedor: disponibilidad.proveedor,
          modelo: disponibilidad.modelo,
          voz: eleccion.voz,
          parametros: eleccion.parametros,
        },
        leerConfirmadoInvalidar(cuerpo),
      );
      break;
    }
    case "registrar-voz-omni":
      /**
       * Registrar la voz Omni **no cuesta créditos** (medido el 2026-09-28), así que no lleva confirmación de
       * coste; lo que sí lleva es la confirmación de lo que invalida, igual que cambiar la voz del modo `pista`.
       */
      await registrarVozOmni(actor, proyectoId, validarEleccionVozOmni(cuerpo), leerConfirmadoInvalidar(cuerpo));
      break;
    case "anadir-musica":
      await anadirMusica(actor, proyectoId, leerMusica(cuerpo));
      break;
    case "quitar-musica":
      await quitarMusica(actor, proyectoId, leerPistaId(cuerpo));
      break;
    case "volumen-musica":
      await cambiarVolumenDeMusica(actor, proyectoId, leerPistaId(cuerpo), leerVolumen(cuerpo));
      break;
    default: {
      /**
       * Lo que es **de una escena**. Que la escena sea tuya lo comprueba cada servicio otra vez; aquí se comprueba
       * además que sea **de este proyecto**, y antes de tocar nada: una escena propia pedida por la URL de otro
       * proyecto es un error de la petición, no un cambio que haya que guardar.
       */
      const escenaId = leerEscenaId(cuerpo);
      const { proyecto } = await escenaPropia(actor, escenaId);
      if (proyecto.id !== proyectoId) throw new ErrorProyecto(404, "Esa escena no existe.");
      const sobrescribir = leerConfirmadoSobrescribir(cuerpo);
      if (cuerpo.accion === "generar-voz") await generarVozDeEscena(actor, escenaId, leerConfirmacionVoz(cuerpo));
      else if (cuerpo.accion === "transcribir") await transcribirEscena(actor, escenaId, sobrescribir);
      else if (cuerpo.accion === "proponer-subtitulos") await proponerSubtitulos(actor, escenaId, sobrescribir);
      else await guardarSubtitulos(actor, escenaId, leerSubtitulos(cuerpo));
    }
  }

  return Response.json(await estadoDeVoz(actor, proyectoId));
});
