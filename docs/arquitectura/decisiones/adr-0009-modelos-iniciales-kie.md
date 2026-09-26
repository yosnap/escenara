# ADR-0009 · Modelos iniciales: solo KIE.ai

- **Estado:** aceptado
- **Fecha:** 2026-09-26
- **Versión del proyecto:** 0.3.0

## Contexto

El PRD confirmaba KIE.ai y Google como primeros proveedores. El prototipo técnico 0.3.0 (tope de 0,50 USD, una persona adulta con consentimiento) probó el flujo «fotograma clave primero» con ambos.

## Evidencia del prototipo

| Paso | Modelo | Coste medido | Resultado |
|---|---|---|---|
| Imagen fija con 5 fotos de referencia | KIE `nano-banana-2-lite` | 4 créditos (0,02 USD) | Identidad fiel y escena creíble, 768×1376 |
| Vídeo de 4 s desde la imagen fija, 720p | KIE `veo3_lite` (`FIRST_AND_LAST_FRAMES_2_VIDEO`) | 60 créditos (0,30 USD) | Identidad estable, 720×1280, 24 fps, con audio; 2 min 28 s |
| Imagen y vídeo | Google Gemini / Veo 3.1 Lite | No probado | La cuenta no tiene facturación y la cuota gratuita de estos modelos es 0 |

Créditos de KIE convertidos a 0,005 USD (tarifa habitual; verificar en la factura).

## Decisión

- **KIE.ai es el único proveedor inicial.** Google queda **aplazado**: se incorporará más adelante con su propio adaptador si aporta valor.
- Imagen de referencia y fotograma clave: `nano-banana-2-lite`.
- Animación: `veo3_lite` a partir del fotograma clave aprobado (`FIRST_AND_LAST_FRAMES_2_VIDEO`), 9:16, 720p.
- `REFERENCE_2_VIDEO` (vídeo directo desde fotos) y `veo3_fast` quedan como alternativas por medir.

## Consecuencias

- El contrato de adaptadores por capacidades se mantiene: añadir Google después no cambia el resto de la aplicación.
- Veo en KIE parece cobrar por vídeo y no por segundo: 4 s costaron más que la tarifa oficial de Google para esa duración. Las duraciones y el registro de precios deben basarse en mediciones propias.
- Las reservas de presupuesto deben partir de costes medidos por modelo y duración; ante un modelo sin medir, la reserva debe ser prudente (en el prototipo se infraestimó ×3 y el tope aguantó solo por margen).
- Las referencias del usuario deben revisarse para detectar otras personas o menores y reducirse de tamaño antes de enviarlas.
