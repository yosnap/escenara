import type { Transporter } from "nodemailer";
import { fijarTransporte } from "./correo";

/**
 * Preload de `bun test` (ver `bunfig.toml`): sustituye el transporte de correo por uno que no envía nada.
 * Los tests crean cuentas y cada una dispara su correo de confirmación; sin esto, cada ejecución de la
 * suite dejaría decenas de mensajes en la bandeja local (Mailpit). El camino de producción no se toca.
 */
const NULO = {
  async sendMail() {
    return { accepted: [], rejected: [], messageId: "prueba" };
  },
} as unknown as Transporter;

fijarTransporte(NULO);
