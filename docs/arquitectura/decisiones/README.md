# Registro de decisiones de arquitectura (ADR)

Cada decisión relevante se documenta en un fichero `adr-NNNN-slug.md` dentro de esta carpeta. Un ADR aceptado no se edita: si cambia la decisión, se crea uno nuevo que lo sustituye.

## Índice

| ADR | Decisión | Necesaria para | Estado |
|---|---|---|---|
| 0001 | Licencia del repositorio: Apache 2.0 o AGPL 3.0 | 0.2.0 | Pendiente del propietario |
| 0002 | Lenguajes y servicios del MVP: TypeScript único o TypeScript y Python | 0.2.0 | Pendiente del propietario |
| 0003 | Cola de trabajos: pg-boss o BullMQ con Redis | 0.9.0 | Pendiente |
| 0004 | Autenticación: Better Auth o Auth.js | 0.6.0 | Pendiente |
| 0005 | Cifrado de credenciales BYOK y gestión de la clave maestra | 0.7.0 | Pendiente |
| [0006](adr-0006-almacenamiento-seaweedfs.md) | Almacenamiento de objetos: SeaweedFS por defecto y API S3 estándar | 0.2.0 | Aceptado |
| 0007 | Despliegue en Easypanel e instancia pública del proyecto | 0.5.0 | Plataforma decidida (Easypanel); instancia pública pendiente del propietario |
| 0008 | Motor de montaje y render | 0.19.0 | Pendiente |
| 0009 | Modelos iniciales por capacidad | 0.8.0 | Tras el informe de 0.3.0 |

## Plantilla

```markdown
# ADR-NNNN · Título

- **Estado:** propuesto | aceptado | sustituido por ADR-XXXX
- **Fecha:** AAAA-MM-DD
- **Versión del proyecto:** 0.N.0

## Contexto
Qué problema hay y qué restricciones aplican.

## Opciones
Dos o tres opciones con su supuesto principal y dónde fallarían primero.

## Decisión
Qué se elige y por qué.

## Consecuencias
Qué se gana, qué se pierde y qué habrá que revisar.
```
