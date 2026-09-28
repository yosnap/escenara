/**
 * Datos públicos de la bóveda de credenciales: se usan en el servidor y en el navegador, así que aquí
 * nunca hay secretos ni nada que dependa de la clave maestra.
 */

/** Mensaje para quien no administra cuando la instalación no tiene clave maestra. */
export const AVISO_BOVEDA_USUARIO = "Esta instalación aún no admite credenciales: pídeselo a quien la administra.";

/**
 * Proveedores **de la bóveda**: los que tienen una clave por usuario, su tarjeta en «Tu cuenta» y su prueba sin
 * coste. Son los únicos con los que se puede pagar una generación.
 */
export const PROVEEDORES = ["kie", "google", "elevenlabs"] as const;
export type ProveedorBoveda = (typeof PROVEEDORES)[number];

/**
 * Proveedores que pueden aparecer en un **apunte de gasto**: los de la bóveda más `compatible` (0.21.1), que no
 * es un servicio concreto sino el género «compatible con la API de OpenAI». Cuál era se guarda en
 * `provider_name`, porque el enum no puede crecer con cada servicio que alguien dé de alta.
 */
export const PROVEEDORES_APUNTE = [...PROVEEDORES, "compatible"] as const;
export type Proveedor = (typeof PROVEEDORES_APUNTE)[number];

/** `true` solo para los proveedores de la bóveda: es lo que decide si se puede cobrar con una clave del usuario. */
export const esProveedor = (v: unknown): v is ProveedorBoveda => PROVEEDORES.includes(v as ProveedorBoveda);

export interface ProveedorPublico {
  id: Proveedor;
  nombre: string;
  /** Qué se genera con este proveedor, en una frase. */
  para: string;
  /** Dónde se obtiene la clave. */
  urlClave: string;
  etiquetaUrlClave: string;
  /** Qué aspecto tiene la clave, para que se reconozca antes de pegarla. */
  ayuda: string;
}

export const PROVEEDORES_PUBLICOS: Record<Proveedor, ProveedorPublico> = {
  kie: {
    id: "kie",
    nombre: "KIE.ai",
    para: "Imágenes y vídeo de tus personajes. Se paga con los créditos de tu cuenta de KIE.",
    urlClave: "https://kie.ai/api-key",
    etiquetaUrlClave: "kie.ai/api-key",
    ayuda: "Una cadena larga que empieza por «sk-» o similar. Cópiala completa, sin espacios.",
  },
  google: {
    id: "google",
    nombre: "Google Gemini",
    para: "Texto e imágenes con los modelos Gemini. Se paga en tu cuenta de Google AI Studio.",
    urlClave: "https://aistudio.google.com/apikey",
    etiquetaUrlClave: "aistudio.google.com/apikey",
    ayuda: "Empieza por «AIza» y tiene unos 39 caracteres.",
  },
  elevenlabs: {
    id: "elevenlabs",
    nombre: "ElevenLabs",
    para: "La voz de los diálogos de tus proyectos. Se paga con los créditos de tu plan de ElevenLabs.",
    urlClave: "https://elevenlabs.io/app/settings/api-keys",
    etiquetaUrlClave: "elevenlabs.io · Settings › API keys",
    ayuda: "Empieza por «sk_» y es una cadena larga. Con una clave restringida basta el permiso de «Text to Speech».",
  },
  compatible: {
    id: "compatible",
    nombre: "Servicio compatible con OpenAI",
    para: "Texto de reserva cuando el modelo de siempre falla. Se paga con la cuota de tu plan en ese servicio.",
    urlClave: "/cuenta",
    etiquetaUrlClave: "Tu cuenta",
    ayuda: "Se configura entero (nombre, dirección, clave y modelos) en «Servicios de reserva para el texto».",
  },
};

export type EstadoCredencial = "valida" | "invalida";

/**
 * Códigos propios del resultado de una prueba. Nunca se guarda ni se muestra el texto del proveedor: así
 * un mensaje suyo no puede acabar reflejando la clave enviada.
 */
export const CODIGOS_PRUEBA = [
  "ok",
  "formato",
  "rechazada",
  "sin-credito",
  "limite",
  "error-proveedor",
  "sin-red",
  "tiempo-agotado",
  "respuesta-inesperada",
] as const;
export type CodigoPrueba = (typeof CODIGOS_PRUEBA)[number];

export const MENSAJE_PRUEBA: Record<CodigoPrueba, string> = {
  ok: "La clave funciona.",
  formato: "Esa clave no tiene el aspecto esperado. Cópiala completa, sin espacios.",
  rechazada: "El proveedor no acepta esta clave. Comprueba que la has copiado entera y que sigue activa.",
  "sin-credito": "La clave es correcta, pero la cuenta no tiene saldo. Recarga créditos en el proveedor.",
  limite: "El proveedor ha recibido demasiadas peticiones. Espera un momento y vuelve a probar.",
  "error-proveedor": "El proveedor ha respondido con un error. Vuelve a probar en un rato.",
  "sin-red": "No se ha podido contactar con el proveedor. Revisa la conexión del servidor.",
  "tiempo-agotado": "El proveedor ha tardado demasiado en responder. Vuelve a probar.",
  "respuesta-inesperada": "El proveedor ha respondido algo que no entendemos. Vuelve a probar en un rato.",
};

/** Vista de una credencial que sí puede llegar al navegador: nunca incluye el secreto. */
export interface CredencialVista {
  proveedor: Proveedor;
  /** Últimos cuatro caracteres de la clave. */
  pista: string;
  estado: EstadoCredencial;
  ultimoCodigo: CodigoPrueba | null;
  /** Dato público de la última prueba (por ejemplo, los créditos de KIE). */
  ultimoDetalle: string | null;
  alta: string;
  ultimaPrueba: string | null;
  ultimaRotacion: string | null;
}
