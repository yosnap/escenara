import { describe, expect, test } from "bun:test";
import type { CausaFalloProveedor } from "@/lib/causa-fallo";
import { causaDelFallo } from "./causa-del-fallo";

/**
 * La causa del fallo se elige con una lista cerrada y patrones estrictos. Lo que importa: el caso real de Google se
 * reconoce, las mayúsculas no cambian nada, y lo que no dice la causa con palabras explícitas queda como
 * `desconocida` en lugar de afirmar una causa falsa. Que el texto del proveedor no salga lo prueban los tests de
 * `consultarTarea` y el de integración, que es donde podría escaparse.
 */
const REAL_GOOGLE = "Request blocked: The generation was blocked by Google safety review.";

/** [failCode, failMsg, causa esperada]. Si un texto no dice la causa con palabras explícitas, es `desconocida`. */
const CASOS: readonly (readonly [unknown, unknown, CausaFalloProveedor])[] = [
  // Real de KIE con Gemini Omni 1.1 Flash, y variantes de mayúsculas y de tipo del código.
  ["400", REAL_GOOGLE, "bloqueo_seguridad"],
  ["400", REAL_GOOGLE.toUpperCase(), "bloqueo_seguridad"],
  [400, REAL_GOOGLE.toLowerCase(), "bloqueo_seguridad"],
  [null, "Your prompt was FLAGGED by our Moderation system", "bloqueo_seguridad"],
  ["", "NSFW content detected", "bloqueo_seguridad"],
  ["", "Content filtered by the safety system", "bloqueo_seguridad"],
  ["", "The input image was blocked by safety review", "bloqueo_seguridad"],
  ["", "Sensitive content detected in the output", "bloqueo_seguridad"],
  // «blocked» sin hablar de seguridad no es un filtro de contenido.
  ["", "Your account is blocked", "desconocida"],
  ["", "Request blocked by upstream network", "desconocida"],
  ["", "Blocked", "desconocida"],
  // Normas de contenido explícitas.
  ["", "The request violates our content policy", "contenido_no_permitido"],
  ["", "Prohibited content: public figure", "contenido_no_permitido"],
  ["", "Possible copyright infringement", "contenido_no_permitido"],
  // Imagen de entrada con un problema de formato, tamaño o acceso, dicho en la misma frase.
  ["", "Failed to download the image from the provided URL", "imagen_rechazada"],
  ["", "Image url is invalid or not accessible", "imagen_rechazada"],
  ["", "Invalid image format", "imagen_rechazada"],
  ["", "Reference image too large", "imagen_rechazada"],
  ["", "The input image could not be downloaded", "imagen_rechazada"],
  // «image» sin hablar de la referencia no es una imagen rechazada.
  ["", "Image generation failed: invalid prompt", "desconocida"],
  ["", "Image generation timeout, task expired", "desconocida"],
  ["", "Failed to generate image, input too large", "desconocida"],
  ["", "video generation failed: reference image and prompt mismatch, not found", "desconocida"],
  ["", "input too large", "desconocida"],
  ["", "not found", "desconocida"],
  // Ritmo: solo con palabras de ritmo o el 429. El saldo o la cuota de la cuenta no se arreglan esperando.
  ["", "Rate limit exceeded, too many requests", "limite"],
  ["", "Request blocked: rate limit exceeded", "limite"],
  ["429", "", "limite"],
  ["", "Insufficient credits, quota exhausted", "desconocida"],
  ["", "Quota exceeded for this account", "desconocida"],
  ["", "Your balance is not enough", "desconocida"],
  // Saturación.
  ["", "The model is overloaded, please try again later", "saturado"],
  ["", "Service unavailable", "saturado"],
  ["503", "", "saturado"],
  // Lo demás.
  // Un 500 del proveedor es un fallo suyo y pasajero (visto con Gemini Omni el 2026-09-30, sin cobro, y el
  // reintento salió bien): se dice que se puede volver a pedir.
  ["500", "Internal error", "error_interno"],
  ["", "500 Internal Error, Please try again later.", "error_interno"],
  ["", "Internal server error", "error_interno"],
  ["", "Insufficient credits, please try again later", "desconocida"],
  ["", "Your account balance is insufficient. Please try again later.", "desconocida"],
  ["", "Invalid prompt, please try again later", "desconocida"],
  ["400", "", "desconocida"],
  [undefined, undefined, "desconocida"],
  [{}, ["safety"], "desconocida"],
  ["", "generation timeout", "desconocida"],
  // Un 500 sin texto es el fallo interno del proveedor; con un texto que no se reconoce, no se inventa causa.
  ["500", "generation failed for request with key sk-clave-que-el-proveedor-repite", "desconocida"],
  ["500", "", "error_interno"],
  ["500", "Insufficient credits, please try again later", "desconocida"],
  ["500", "Invalid prompt", "desconocida"],
];

describe("causaDelFallo", () => {
  for (const [codigo, mensaje, esperada] of CASOS) {
    test(`${JSON.stringify(codigo)} · ${JSON.stringify(mensaje)} → ${esperada}`, () => {
      expect(causaDelFallo(codigo, mensaje)).toBe(esperada);
    });
  }
});
