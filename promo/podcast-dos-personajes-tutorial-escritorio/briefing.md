# Briefing · Tutorial «Podcast / dualcast con dos personajes» (escritorio, para YouTube)

Sexto tutorial de la serie (`plans/261017-0246-serie-tutoriales/plan.md`). Enseña a poner a **dos personajes en la
misma escena** de un proyecto: Brisa y Elisa en un **dualcast** (las dos en el mismo plano, hablando por turnos) en
la Terraza Mirto. La versión móvil (`../podcast-dos-personajes-tutorial/`) tiene el mismo guion y las mismas
acciones; solo cambian el viewport y el proyecto.

## Decisiones del propietario (2026-10-18)

- Estilo tutorial, sin voz: rótulo breve por escena y frases como subtítulos (`"voz": { "proveedor": "ninguna" }`).
- Generaciones reales con KIE en la cuenta «Tutoriales», tope de 300 créditos para todo el tutorial. Se reutiliza
  **Brisa** (`d94ad9b9-09fa-45da-a708-e021920cdafc`); el segundo personaje es **Elisa**
  (`cc158e15-551c-463a-90bc-fd0d45b21d79`), persona inventada que ya estaba en la cuenta.
- Al final se reproduce el clip generado, con su sonido y la música bajada (acción `reproducir`).
- Cierre con escenara.com y docs.escenara.com.

## Decisiones mías

- **Dualcast y no podcast**: la guía (`docs/guias/podcast-y-dualcast.md`) ofrece los dos en Proyecto › Escenas ›
  Reparto. El dualcast es un solo clip con las dos caras (63 créditos a 4 s, 65 estimados con la traducción); el podcast son
  dos clips y cuesta el doble por pasada. El vídeo enseña la ventana con los tres formatos y explica la
  diferencia.
- **Requisitos fuera de cámara, sin gasto**: el reparto exige un proyecto en modo Omni con su voz registrada y los
  dos personajes registrados con esa voz (`server/omni/estimacion-reparto.ts`). Cada versión usa un proyecto propio
  «Charla en la terraza», preparado antes de grabar con la API de la app: proyecto 9:16 con Brisa de protagonista,
  clips de 4 s y la Terraza Mirto como lugar del proyecto; una escena escrita; modo Omni con la voz Sulafat y la
  descripción de fábrica (español de España); registro de Brisa y Elisa desde sus fichas. Registrar no cuesta
  créditos. La grabación «voz» enseña ese requisito ya cumplido.
- **16:9 no**: la cuenta tiene Nano Banana 2 Lite y Veo 3.1 Fast en su mapa, que solo admiten 9:16, y la app no
  deja crear el proyecto en horizontal.
- **Clips de 4 s, no de 6**: la app ofrece 6 s en Omni (84 créditos), pero al producir rechaza la escena porque mira
  la duración contra el modelo de animación del mapa de vídeo (Veo 3.1 Fast, 4 u 8 s) y no contra Gemini Omni
  (`server/produccion/consulta.ts:637-645`). 4 s vale para los dos.
- **Diálogo**: «¿Café mañana en la terraza?» (Brisa) y «¡Hecho! Invito yo.» (Elisa), 8 palabras; caben en 4 s (la
  app calcula 2,5 palabras por segundo). Las dos «hablan» y se cruzan las miradas (Brisa hacia la
  derecha, Elisa hacia la izquierda); Elisa entra como «Escucha y reacciona» y se cambia en cámara.
- **Misma voz**: en Omni las dos usan la voz del proyecto; la app lo avisa y pide una casilla antes de pagar. El
  vídeo lo dice.
- **Cada tramo empieza por el paso que lo abre** («Siguiente: Aprobación», «Producir las escenas»…), para que la
  pantalla no empiece a desplazarse hacia el paso siguiente mientras aún sale la frase del actual.
- **Viewport** `{ "ancho": 1600, "alto": 856 }`. Desplegables con `role=combobox[name=…]` y `[role=option]:visible`,
  acotados al miembro del reparto con `li:has(p:has-text('Elisa'))`.
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
| clip, ver, despues | `reparto-produccion.tsx` («Clip de los dos personajes»), `vista-produccion.tsx` («Montaje y exportación») |

## Cómo repetir

- Prepara antes un proyecto nuevo como el descrito (sin gasto) y pon su id en las dos rutas de `capturas.json`: cada
  pasada deja la escena producida.
- Desde el motor (`fabrica-videos-tutorial`): `pnpm video --video <esta carpeta>`.
- Cada pasada genera un clip de Gemini Omni de 4 s: 63 créditos de KIE (la app estima 65 con la traducción).
