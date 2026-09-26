# Registro de decisiones de arquitectura (ADR)

Cada decisión relevante se documenta en un fichero `adr-NNNN-slug.md` dentro de esta carpeta. Un ADR aceptado no se edita: si cambia la decisión, se crea uno nuevo que lo sustituye.

## Índice

| ADR | Decisión | Necesaria para | Estado |
|---|---|---|---|
| [0001](adr-0001-licencia-agpl.md) | Licencia del repositorio: AGPL 3.0 | 0.2.0 | Aceptado |
| [0002](adr-0002-typescript-unico-mvp.md) | Lenguajes del MVP: TypeScript único | 0.2.0 | Aceptado |
| 0003 | Cola de trabajos: pg-boss o BullMQ con Redis | 0.9.0 | Pendiente |
| 0004 | Autenticación: Better Auth o Auth.js | 0.6.0 | Pendiente |
| 0005 | Cifrado de credenciales BYOK y gestión de la clave maestra | 0.7.0 | Pendiente |
| [0006](adr-0006-almacenamiento-seaweedfs.md) | Almacenamiento de objetos: SeaweedFS por defecto y API S3 estándar | 0.2.0 | Aceptado |
| 0007 | Despliegue en Easypanel e instancia pública del proyecto | 0.5.0 | Plataforma decidida (Easypanel); instancia pública pendiente del propietario |
| 0008 | Motor de montaje y render | 0.19.0 | Pendiente |
| 0009 | Modelos iniciales por capacidad | 0.8.0 | Tras el informe de 0.3.0 |
| [0010](adr-0010-bun-runtime.md) | Bun como runtime, gestor de paquetes y ejecutor de tests | 0.2.0 | Aceptado |

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
