# Visión de arquitectura

**Estado:** propuesta; las piezas marcadas como pendientes dependen de los ADR de `decisiones/README.md` · **Base:** PRD 0.5, secciones 6 y 7

## Componentes

```mermaid
flowchart LR
    U[Navegador] --> W[Web Next.js<br/>interfaz y API]
    W --> DB[(PostgreSQL<br/>cuentas, personajes,<br/>consentimiento, trabajos,<br/>UsageLedger)]
    W --> S3[(Almacenamiento S3<br/>referencias y medios)]
    W --> Q[Cola persistente]
    Q --> WK[Workers<br/>imagen, vídeo, voz,<br/>subtítulos, FFmpeg]
    WK --> AD[Adaptadores por capacidad]
    AD -.->|aplazado| G[Google<br/>Gemini, Veo, TTS]
    AD --> K[KIE.ai<br/>agregador]
    W --> DEC[Servicio de decisiones<br/>contrato HTTP]
    DEC --> R[Reglas deterministas]
    DEC -.->|modo sombra, 0.23.0| J[Jev / Laya]
    WK --> DB
    WK --> S3
```

- **Web:** Next.js con la interfaz (capa Escenario y zonas de claridad) y la API con autorización por usuario y proyecto.
- **Cola y workers:** trabajos asíncronos idempotentes con estado persistido; FFmpeg para montaje y subtítulos.
- **Adaptadores:** contrato por capacidades del PRD: `image_edit`, `image_to_video`, `text_to_video`, `tts`, `speech_to_text`, `multimodal_review`, más `text_generation` para guion y storyboard (hueco detectado en el PRD).
- **Decisiones:** reglas deterministas para precio, consentimiento, límites técnicos y políticas. Jev o Laya se incorporan detrás del mismo contrato, primero en modo sombra.
- **Secretos:** credenciales BYOK cifradas en servidor (cifrado de sobre con clave maestra del operador); nunca vuelven íntegras al navegador ni a los logs.

## Flujo de generación «fotograma clave primero»

1. El asistente produce guion y storyboard (`text_generation`) y el usuario los aprueba.
2. Los controles previos comprueban credenciales, capacidades, consentimiento y presupuesto (RF12).
3. Se reserva de forma atómica el coste máximo estimado (RF14).
4. Se genera una **imagen fija por escena** con las referencias del personaje (`image_edit`) y el usuario la aprueba.
5. Se anima la imagen aprobada (`image_to_video`).
6. La voz se genera aparte con TTS y la misma voz para todo el proyecto; la sincronía labial es opcional.
7. Revisión de continuidad y humana (RF07); se acepta, corrige o regenera **solo** la escena afectada.
8. Montaje, subtítulos, etiqueta de contenido sintético y exportación (RF08).

## Entidades del PRD

`User`, `ProviderCredential`, `Character`, `ConsentRecord`, `ReferenceAsset`, `CharacterVersion`, `PromptTemplate`, `Project`, `Scene`, `GenerationJob`, `ReviewResult`, `Export` y `UsageLedger`. Se añadirán `ModelCatalogEntry` (registro de modelos con estado y fecha de precio) y `DecisionRecord` (decisión, evidencia, umbral, versión de reglas y corrección humana) cuando se implementen 0.10.0 y 0.23.0.

## Pila propuesta

| Pieza | Propuesta | Estado |
|---|---|---|
| Lenguaje del MVP | TypeScript único; Python cuando Laya o LangGraph aporten valor medido | Decidido (ADR-0002) |
| Web y API | Next.js 16 (App Router) en `apps/web` | Implantado en 0.2.0 |
| Runtime y herramientas | Bun 1.4.2+ (runtime, workspaces, `bun test`, `Bun.SQL`, `Bun.S3Client`), Biome y TypeScript estricto | Decidido (ADR-0010) |
| Licencia | AGPL 3.0 | Decidido (ADR-0001) |
| Base de datos | PostgreSQL | Decidido en el PRD |
| Cola | PostgreSQL con `FOR UPDATE SKIP LOCKED` y worker en proceso aparte | Decidido, ADR-0003 |
| Autenticación | Better Auth o Auth.js | Pendiente, ADR-0004 |
| Cifrado de credenciales | AES-256-GCM con cifrado de sobre y clave maestra en el entorno o gestor de secretos | Pendiente, ADR-0005 |
| Almacenamiento | SeaweedFS (API S3) en local y en la instalación propia; en producción, SeaweedFS en Easypanel para el piloto y almacenamiento gestionado en la UE si crece | Decidido: SeaweedFS (ADR-0006) |
| Despliegue | Docker Compose en local; Easypanel para la instancia del proyecto | Decidido: Easypanel (ADR-0007) |
| Montaje | FFmpeg en workers | Pendiente, ADR-0008 |
| Modelos iniciales | KIE: `nano-banana-2-lite` (fotograma clave) y `veo3_lite` (animación); Google aplazado | Decidido (ADR-0009) |

## Entorno local

| Servicio | Puerto del host | Puerto interno | Nota |
|---|---|---|---|
| Aplicación web (Next.js) | **3021** | 3021 | Siempre `http://localhost:3021` |
| PostgreSQL | **5421** | 5432 | Contenedor Docker; desde otros contenedores se usa `5432` |
| SeaweedFS (pasarela S3) | **8321** | 8333 | Solo se publica la pasarela S3; maestro, volúmenes y filer quedan internos |

Los puertos son fijos. Si al arrancar uno está ocupado, se identifica el proceso con `lsof -nP -iTCP:PUERTO -sTCP:LISTEN` y se detiene si pertenece a Escenara; no se arranca en otro puerto. El 5421 se eligió porque el 5438 ya lo usa otro proyecto en la máquina de desarrollo, y el 8321 porque el 8333 habitual de SeaweedFS también está ocupado. El puerto del correo local se fija en 0.2.0 con la misma comprobación.

## Principios

- Ninguna generación se envía sin aprobación, sin presupuesto reservado o con una regla obligatoria fallida.
- Sin reintentos de pago automáticos; tras un timeout se consulta el estado antes de reenviar.
- Todo lo que se genera guarda proveedor, modelo, versión de plantilla, consentimiento y coste comunicado.
- Los adaptadores se prueban con pruebas de contrato; añadir un modelo al catálogo no lo habilita automáticamente.
- Validación de URLs externas contra SSRF y límites de uso por cuenta.
