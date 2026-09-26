# ADR-0001 · Licencia AGPL 3.0

- **Estado:** aceptado
- **Fecha:** 2026-09-26
- **Versión del proyecto:** 0.2.0

## Contexto

Escenara se publica como código abierto y se podrá instalar en servidores propios. El PRD dejaba como candidatas Apache 2.0 (máxima adopción) y AGPL 3.0 (reciprocidad en servicios alojados).

## Opciones

| Opción | Supuesto principal | Dónde falla primero |
|---|---|---|
| Apache 2.0 | La adopción por empresas pesa más que recibir las mejoras | Un tercero puede ofrecer Escenara como servicio cerrado sin devolver cambios |
| **AGPL 3.0** | Las mejoras de quien lo ofrezca como servicio deben volver a la comunidad | Algunas empresas evitan la AGPL por política interna |

## Decisión

El propietario elige **AGPL 3.0 solo** (`AGPL-3.0-only`). Quien ofrezca una versión modificada como servicio en red debe publicar su código fuente.

## Consecuencias

- `LICENSE` contiene el texto oficial de la GNU AGPL v3 y los `package.json` declaran `AGPL-3.0-only`.
- Las contribuciones se aceptan bajo la misma licencia (ver `CONTRIBUTING.md`).
- Las dependencias deben ser compatibles con la AGPL; modelos, fuentes, música y recursos de terceros conservan sus propias licencias y se revisan aparte.
- Una marca blanca o licencia comercial dual sería una decisión futura separada.
