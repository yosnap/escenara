# ADR-0002 · TypeScript único en el MVP

- **Estado:** aceptado
- **Fecha:** 2026-09-26
- **Versión del proyecto:** 0.2.0

## Contexto

El PRD proponía Next.js para la web y un servicio Python con LangGraph para las decisiones desde el inicio. Para un equipo pequeño, dos lenguajes implican dos cadenas de herramientas, dos despliegues y contratos duplicados, mientras que el flujo del MVP es una máquina de estados con aprobaciones humanas persistida en PostgreSQL.

## Opciones

| Opción | Supuesto principal | Dónde falla primero |
|---|---|---|
| TypeScript y Python desde 0.2.0 | LangGraph y Laya aportan valor inmediato | Velocidad del equipo; validaciones y modelos duplicados |
| **TypeScript único** | El MVP se resuelve con estado en PostgreSQL, cola y reglas | Si el asistente necesita reanudaciones multiagente complejas antes de lo previsto |
| Backend Python y Next.js solo como interfaz | La lógica pesada es de IA y medios | Autenticación y sesiones duplicadas |

## Decisión

El MVP se construye **solo en TypeScript**: Next.js (interfaz y API), workers en Node.js y adaptadores de proveedores. El servicio de decisiones se define como un **contrato HTTP** (0.9.0) para que un servicio Python (LangGraph o Laya) pueda añadirse después sin reescribir el resto, cuando su valor esté medido (a partir de 0.21.0).

## Consecuencias

- Monorepo pnpm con `apps/*` y `packages/*`; Biome para lint y formato, Vitest para tests y TypeScript estricto.
- Se aparta del PRD: el PRD queda actualizado con esta decisión.
- Introducir Python más adelante requerirá un nuevo ADR con la evidencia que lo justifique.
