# Registro de decisiones de arquitectura (ADR)

Cada decisión relevante se documenta en un fichero `adr-NNNN-slug.md` dentro de esta carpeta. Un ADR aceptado no se edita: si cambia la decisión, se crea uno nuevo que lo sustituye.

## Índice

| ADR | Decisión | Necesaria para | Estado |
|---|---|---|---|
| [0001](adr-0001-licencia-agpl.md) | Licencia del repositorio: AGPL 3.0 | 0.2.0 | Aceptado |
| [0002](adr-0002-typescript-unico-mvp.md) | Lenguajes del MVP: TypeScript único | 0.2.0 | Aceptado |
| [0003](adr-0003-cola-postgresql.md) | Cola de trabajos sobre PostgreSQL con `FOR UPDATE SKIP LOCKED` | 0.12.0 | Aceptado |
| [0004](adr-0004-autenticacion-better-auth.md) | Autenticación con Better Auth | 0.7.0 | Aceptado |
| [0005](adr-0005-boveda-credenciales.md) | Bóveda de credenciales BYOK y gestión de la clave maestra | 0.9.0 | Aceptado |
| [0006](adr-0006-almacenamiento-seaweedfs.md) | Almacenamiento de objetos: SeaweedFS por defecto y API S3 estándar | 0.2.0 | Aceptado |
| 0007 | Despliegue en Easypanel e instancia pública del proyecto | 0.33.0 | Plataforma decidida (Easypanel); instancia pública pendiente del propietario |
| 0008 | Motor de montaje y render | 0.22.0 | Pendiente |
| [0009](adr-0009-modelos-iniciales-kie.md) | Modelos iniciales: solo KIE.ai (Google aplazado) | 0.10.0 | Aceptado |
| [0010](adr-0010-bun-runtime.md) | Bun como runtime, gestor de paquetes y ejecutor de tests | 0.2.0 | Aceptado |
| [0011](adr-0011-interfaz-componentes.md) | Pila de interfaz, catálogo de componentes en el admin y prohibición del `<select>` nativo | 0.4.0 | Aceptado |
| [0012](adr-0012-drizzle-orm.md) | Acceso a PostgreSQL y migraciones con Drizzle ORM | 0.5.0 | Aceptado |
| [0013](adr-0013-configuracion-en-panel.md) | La configuración se gestiona en el panel de administración | 0.8.0 | Aceptado |
| [0014](adr-0014-seguimiento-trabajos-sondeo.md) | Seguimiento de los trabajos de generación por sondeo (callback en 0.12.0) | 0.10.0 | Aceptado |
| [0015](adr-0015-contrato-adaptadores-capacidades.md) | Contrato de adaptadores por capacidades y catálogo de modelos en la base de datos | 0.11.0 | Aceptado |
| [0016](adr-0016-reserva-y-conciliacion-de-gasto.md) | Reserva y conciliación del gasto: registro de apuntes como única verdad | 0.12.0 | Aceptado |
| [0017](adr-0017-consentimiento-de-personajes.md) | Consentimiento de personajes: registro con prueba, revisión humana y borrado de derivados | 0.13.0 | Propuesto (decisiones provisionales pendientes del propietario) |
| [0018](adr-0018-ficha-como-contexto-y-version-citada.md) | La ficha del personaje es contexto de generación y cada trabajo cita su versión | 0.15.0 | Propuesto (decisiones provisionales pendientes del propietario) |
| [0019](adr-0019-presets-y-plantillas-de-prompt.md) | Presets y plantillas de prompt: prompts en inglés, compuestos en el servidor y con versión citada | 0.16.0 | Propuesto (decisiones provisionales pendientes del propietario) |

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
