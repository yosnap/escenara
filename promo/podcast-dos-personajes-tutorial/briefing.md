# Briefing · Tutorial «Podcast / dualcast con dos personajes» (móvil)

Sexto tutorial de la serie (`plans/261017-0246-serie-tutoriales/plan.md`). Enseña a poner a **dos personajes en la
misma escena** de un proyecto: Brisa y Elisa en un **dualcast** (las dos en el mismo plano, hablando por turnos) en
la Terraza Mirto. La versión de escritorio (`../podcast-dos-personajes-tutorial-escritorio/`, la que va a YouTube) tiene el mismo
guion y las mismas acciones; solo cambian el viewport y el proyecto.

## Decisiones del propietario (2026-10-18)

- Estilo tutorial, sin voz: rótulo breve por escena y frases como subtítulos (`"voz": { "proveedor": "ninguna" }`).
- Generaciones reales con KIE en la cuenta «Tutoriales», tope de 300 créditos para todo el tutorial. Se reutiliza
  **Brisa** (`d94ad9b9-09fa-45da-a708-e021920cdafc`); el segundo personaje es **Elisa**
  (`cc158e15-551c-463a-90bc-fd0d45b21d79`), persona inventada que ya estaba en la cuenta.
- Al final se reproduce el clip generado, con su sonido y la música bajada (acción `reproducir`).
- Cierre con escenara.com y docs.escenara.com.

## Decisiones mías

- **Dualcast y no podcast**: la guía (`docs/guias/podcast-y-dualcast.md`) ofrece los dos en Proyecto › Escenas ›
  Reparto. El dualcast es un solo clip con las dos caras (84 créditos a 6 s, 86 estimados con la traducción); el podcast son
  dos clips y cuesta el doble por pasada. El vídeo enseña la ventana con los tres formatos y explica la
  diferencia.
- **Requisitos fuera de cámara, sin gasto**: el reparto exige un proyecto en modo Omni con su voz registrada y los
  dos personajes registrados con esa voz (`server/omni/estimacion-reparto.ts`). Cada versión usa un proyecto propio
  «Charla en la terraza», preparado antes de grabar con la API de la app: proyecto 9:16 con Brisa de protagonista,
  clips de 6 s y la Terraza Mirto como lugar del proyecto; una escena escrita; modo Omni con la voz Sulafat y la
  descripción de fábrica (español de España); registro de Brisa y Elisa desde sus fichas. Registrar no cuesta
  créditos. La grabación «voz» enseña ese requisito ya cumplido.
- **16:9 no**: la cuenta tiene Nano Banana 2 Lite y Veo 3.1 Fast en su mapa, que solo admiten 9:16, y la app no
  deja crear el proyecto en horizontal.
- **Modelo y duración (0.52.15)**: la escena se estima y se produce con Gemini Omni 1.1 Flash a 6 s, y el plan, el
  editor y producción enseñan ese modelo y ese coste. Antes de grabar se comprobó en pantalla.
- **Diálogo**: «¿Café mañana en la terraza?» (Brisa) y «¡Hecho! Y esta vez invito yo.» (Elisa), 11 palabras;
  caben en 6 s (la app calcula 2,5 palabras por segundo). Las dos «hablan» y se cruzan las miradas (Brisa hacia la
  derecha, Elisa hacia la izquierda); Elisa entra como «Escucha y reacciona» y se cambia en cámara.
- **Misma voz**: en Omni las dos usan la voz del proyecto; la app lo avisa y pide una casilla antes de pagar. El
  vídeo lo dice.
- **Cada tramo empieza por el paso que lo abre** («Siguiente: Aprobación», «Producir las escenas»…), para que la
  pantalla no empiece a desplazarse hacia el paso siguiente mientras aún sale la frase del actual.
- **Viewport**: el del móvil por defecto del motor; el motor se desplaza solo hasta cada objetivo antes de tocarlo. Desplegables con `role=combobox[name=…]` y `[role=option]:visible`,
  acotados al miembro del reparto con `li:has(p:has-text('Elisa'))`.
- **El clip se reproduce en «Montaje y exportación»** (grabación `resultado`): en escritorio, la tarjeta de
  producción pinta el clip a 856×1522 px, más alto que la ventana, y `reproducir` necesita el vídeo entero en
  pantalla. En la línea de tiempo del montaje sale con sus controles y cabe.
- **Escritorio sin segundo gasto**: su primera pasada generó el clip de verdad (proyecto `2d6bc37d-…`) y falló en
  `reproducir`. La pasada final se graba en un proyecto gemelo, preparado igual, y el envío de producción se responde
  con la producción real del primero (`interceptar` con `responderCon`); «resultado» reproduce ese clip en su montaje.
  El móvil se graba con su propia generación.
- **Esperas**: el clip se espera en la tarjeta de producción, que se refresca sola mientras hay algo en vuelo; hasta
  15 min. **Bloqueos**: `DELETE` de personajes, productos, lugares, medios, proyectos y escenas.
- **Ensayo sin gasto** antes de grabar: un proyecto de prueba con las mismas acciones y la producción respondida con
  403 llegó a «Generar el clip» sin generar; después se borró.

## Evidencia de cada frase

| Escena | Evidencia |
|---|---|
| voz | `app/proyectos/[id]/voz/_componentes/panel-voz-omni.tsx` («Registrar no cuesta créditos», «está registrado con esta voz»), `app/personajes/[id]/_componentes/panel-omni.tsx` |
| escena | `editor-escena.tsx`, `components/ui/lugares/selector-lugar.tsx` («El del proyecto: Terraza Mirto») |
| abrir, formato, segundo | `reparto/panel-reparto.tsx` («Abrirlo no gasta nada», `AYUDA_FORMATO_REPARTO`, «como mucho 2») |
| papel, miradas | `panel-reparto.tsx` («Qué hace», «Adónde mira»), `lib/reparto.ts` |
| turnos, guardar-dialogo | `reparto/editor-turnos.tsx` («tal cual, en castellano y sin traducir»), `ResumenDeLoPedido` |
| estimacion | aviso `mismaVoz` y estimación de `panel-reparto.tsx`, `server/omni/estimacion-reparto.ts` |
| aprobar | `panel-aprobacion.tsx` («Aprobar no genera nada: autoriza») |
| producir, confirmar, generar | `produccion/_componentes/reparto-produccion.tsx` (confirmación por el total, «No hay fotograma que aprobar»), `confirmacion-gasto.tsx` |
| clip | `reparto-produccion.tsx` («Clip de los dos personajes») |
| ver, despues | `montaje/_componentes/vista-montaje.tsx` (línea de tiempo con el clip), `panel-exportacion.tsx` («Exportar el vídeo») |

## Cómo repetir

- Prepara antes un proyecto nuevo como el descrito (sin gasto) y pon su id en las rutas de `capturas.json`: cada
  pasada deja la escena producida.
- Desde el motor (`fabrica-videos-tutorial`): `pnpm video --video <esta carpeta>`.
- Cada pasada con generación cuesta un clip de Gemini Omni 1.1 Flash de 6 s: 84 créditos de KIE (la app estima 86
  con la traducción).
- Para reutilizar un clip ya hecho sin pagar otro, añade a «dualcast» el `interceptar` con `responderCon: /api/proyectos/<producido>/produccion` y apunta «resultado» a su montaje.
