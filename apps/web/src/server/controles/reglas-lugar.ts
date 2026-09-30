import type { Freno, Hechos } from "./contrato";

/**
 * Reglas del **lugar** del motor de controles, aparte para que `motor.ts` no crezca más. Van detrás de las del
 * producto: primero lo que bloquea (sin declaración, acabado distinto, plano solo sin maestra) y después los avisos
 * que se salvan confirmándolos (sin maestra, la maestra no cabe).
 *
 * Lo que no hay aquí, a propósito: una regla de «personas reconocibles en la foto». Sin detector propio de caras,
 * la puerta es la **declaración**, que no se puede hacer con gente reconocible ni con menores; sin declaración
 * vigente, esta primera regla bloquea.
 */
export const REGLAS_LUGAR: readonly ((h: Hechos) => Freno | null)[] = [
  (h) => {
    if (!h.lugar || h.lugar.declarado) return null;
    return {
      regla: "lugar-sin-declaracion",
      estado: "bloqueado",
      motivo: `«${h.lugar.nombre}» no tiene una declaración de derechos vigente: sin ella no se genera con el lugar. Se retira sola al cambiar sus fotos, y también si la revocaste.`,
      accion:
        "Abre el lugar y declara de dónde son sus fotos, quién sale en ellas y si puedes usarlo. Con gente reconocible, retírala antes o cambia la foto; con menores, no se puede usar.",
      enlace: `/lugares/${h.lugar.id}`,
      http: 409,
      excepcion: "generacion",
    };
  },
  (h) => {
    if (!h.lugar?.acabadoDistinto) return null;
    return {
      regla: "lugar-acabado-distinto",
      estado: "bloqueado",
      motivo: h.lugar.acabadoDistinto,
      accion:
        "Elige un lugar con el mismo acabado: uno real en un proyecto realista, o uno animado del mismo estilo en un proyecto animado.",
      http: 409,
      excepcion: "generacion",
    };
  },
  (h) => {
    if (!h.lugar?.sinMaestra || !h.lugar.soloLugar) return null;
    return {
      regla: "lugar-solo-sin-maestra",
      estado: "bloqueado",
      motivo: `El plano de «${h.lugar.nombre}» solo parte de su foto maestra, y el lugar no tiene ninguna (o está en la papelera).`,
      accion: "Abre el lugar y marca una foto como maestra.",
      enlace: `/lugares/${h.lugar.id}`,
      http: 409,
      excepcion: "generacion",
    };
  },
  (h) => {
    if (!h.lugar?.sinMaestra || h.lugar.soloLugar) return null;
    return {
      regla: "lugar-sin-maestra",
      estado: "ajustes",
      motivo: `«${h.lugar.nombre}» no tiene foto maestra, así que no se envía ninguna imagen del sitio: el lugar viajará solo descrito con palabras y puede salir distinto.`,
      accion: "Marca una foto como maestra en la ficha del lugar, o confirma que te vale solo descrito.",
      enlace: `/lugares/${h.lugar.id}`,
      http: 409,
      excepcion: "generacion",
      confirmable: true,
    };
  },
  (h) => {
    if (!h.lugar?.maestraNoCabe) return null;
    return {
      regla: "lugar-maestra-no-cabe",
      estado: "ajustes",
      motivo: `Con ${h.modelo?.nombre ?? "este modelo"} no cabe la foto maestra de «${h.lugar.nombre}»: sus huecos de referencia son para la persona${h.producto ? " y el producto" : ""}. El lugar viajará solo descrito con palabras.`,
      accion:
        "Elige un modelo que admita más referencias y vuelve a estimar el coste, porque la tarifa es otra. Si te vale con la descripción, confírmalo.",
      http: 409,
      excepcion: "generacion",
      confirmable: true,
    };
  },
];
