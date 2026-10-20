# Briefing · Tutorial «Personaje en un lugar, interactuando» (móvil)

Quinto tutorial de la serie (`plans/261017-0246-serie-tutoriales/plan.md`). Enseña a hacer en **«Crear»** un clip
que ocurre en un lugar propio: Brisa en la **Terraza Mirto** (creada en el tutorial 3), sentada a una mesa, con un
gesto con lo que tiene delante y una cámara que revela el sitio. La versión de escritorio (`../personaje-en-lugar-tutorial-escritorio/`, la que va a YouTube)
tiene el mismo guion y las mismas acciones; solo cambia el viewport.

## Decisiones del propietario (2026-10-17)

- Estilo tutorial, sin voz: rótulo breve por escena y frases como subtítulos (`"voz": { "proveedor": "ninguna" }`).
- Generaciones reales con KIE en la cuenta «Tutoriales», tope de 300 créditos para todo el tutorial. Se reutilizan
  **Brisa** (`d94ad9b9-09fa-45da-a708-e021920cdafc`) y **Terraza Mirto** (`27ae3dc9-a1c2-4f93-acc3-a69ccb646196`).
- Al final se reproduce el clip generado, con su sonido y la música bajada (acción `reproducir`), sin regenerar.
- Cierre con escenara.com y docs.escenara.com.

## Decisiones mías

- **Cómo entra el lugar en «Crear»**: en «Describe la escena», bloque «El lugar» (`SelectorLugar`): «Dónde ocurre»
  ofrece «Sin lugar» y tus lugares; elegido uno, aparece «Dónde, dentro del lugar (opcional)», que sustituye a la
  localización de la dirección. La maestra del lugar viaja como referencia del fotograma, detrás de las fotos del
  personaje (`server/generacion/servicio.ts:304-308`, `:586`), y el clip lo hereda de esa imagen.
- **Qué interacción se enseña** (lo que de verdad ofrece la app):
  - la escena escrita dice qué hace allí (sentada a una mesa, con su café);
  - «Dónde, dentro del lugar»: «En la mesa junto a los limoneros, bajo el toldo»;
  - en el clip, «Movimiento de cámara: Retroceso que revela» («Se aleja y aparece el sitio entero»), el que luce el
    lugar;
  - «Micro-acción: Bebe un sorbo» («Da un trago a lo que tiene en la mano»), con «Cuándo ocurre el gesto: Antes de
    hablar», que es el momento que propone el catálogo;
  - instrucciones escritas y el resumen «Le pedirás…» que compone la app.
- **Modelo del clip: MiniMax H3**, 40 créditos por 5 s a 768P. Es el más barato de KIE **con voz**: Hailuo 2.3
  Standard (30) no tiene audio y el final del tutorial reproduce el clip con su sonido; Veo 3.1 Lite/Fast cuestan 60
  y Gemini Omni 63. El fotograma, con `nano-banana-2-lite` (4 créditos más 2 de traducción como máximo). Unos 46
  créditos por pasada.
- **El clip se reproduce en la misma grabación**: tras «Clip listo», la acción `reproducir` toca el play del vídeo
  real. No hace falta la segunda grabación con `interceptar` del tutorial 4.
- **Ventanas de opciones acotadas**: la ventana admite 12 opciones como mucho. «Movimiento de cámara» tiene 14
  tarjetas y «Micro-acción» 21 opciones, así que se enseñan las 9 primeras tarjetas (`label:nth-child(-n+9)`) y las
  12 últimas opciones (`[role=option]:visible:nth-child(n+10)`), que contienen la elegida.
- **Viewport**: el del móvil por defecto del motor; en el clip se añaden desplazamientos para que cada objetivo quede a la vista. Desplegables con `role=combobox[name=…]` y `[role=option]:visible`;
  electores visuales con `fieldset:has(> legend:has-text('…')) label`.
- **Espera del paso 6 de hasta 2 min tras «Generar fotograma»**: el envío traduce la escena antes de crear el
  trabajo y puede tardar más de los 15 s de una espera normal (en la primera pasada tardó unos 14 s y la grabación
  se cortó con el trabajo ya creado). Con `indicador: false` no ocupa tiempo en el vídeo.
- **Esperas**: como en el tutorial 4, tras «Generar fotograma» se baja al paso 6 en cuanto aparece, la espera del
  clip se hace con la barra de pasos a la vista y no se recarga la página. Hasta 10 min para el fotograma y 15 para
  el clip.
- **Sin preparación**: «Crear» no deja recursos con nombre que choquen al repetir. **Bloqueos**: `DELETE` de
  personajes, productos, lugares y medios.

## Evidencia de cada frase

| Escena | Evidencia |
|---|---|
| formato, origen, quien | `paso-formato.tsx`, `paso-origen.tsx`, `paso-sujeto.tsx:86` y `AVISO_SIN_TERCEROS` |
| escena | `paso-escena.tsx` («Qué quieres ver»: dónde está, qué hace y cómo se ve) |
| lugar | `components/ui/lugares/selector-lugar.tsx` («El lugar», «Dónde ocurre», «Dónde, dentro del lugar»), `use-lugar-crear.ts`, `server/generacion/servicio.ts:586` (la maestra viaja la última) |
| coste | `paso-fotograma.tsx` (`PasoCosteFotograma`), `panel-contexto.tsx` (fotos del personaje) |
| generar-fotograma, fotograma | `panel-generar.tsx` («Tengo derecho a usar esta imagen»), `resultado-trabajo.tsx` («Fotograma listo») |
| modelo-clip | `paso-clip.tsx` (`SelectorModelo`), `models.has_voice` de `minimax-h3/reference-to-video` |
| dice | `paso-clip.tsx` («Lo que dice», «Es lo que se le oirá decir, tal cual»), acento España por defecto |
| camara, gesto | `components/ui/direccion/panel-direccion.tsx` («Movimiento de cámara», «Micro-acción», «Cuándo ocurre el gesto»), presets `retroceso-revela` y `beber` |
| instrucciones | `panel-direccion.tsx` («Escríbelo tú», resumen «Le pedirás…») |
| confirmar-clip | `panel-generar.tsx`, `BloqueConfirmacion` («Animar 5 s») |
| clip, ver-clip, opciones-clip | `resultado-trabajo.tsx` («Clip listo»), `visor-medio.tsx`, `paso-clip.tsx` («Otro clip con este fotograma»), `convertir-en-proyecto.tsx` |

## Cómo repetir

- Desde el motor (`fabrica-videos-tutorial`): `pnpm video --video <esta carpeta>` (graba y renderiza) o
  `pnpm preparar --video <esta carpeta>` y después `pnpm video --video <esta carpeta> --sin-capturas`.
- Cada pasada genera un fotograma y un clip: unos 46 créditos de KIE.
