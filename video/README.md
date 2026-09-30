# Vídeo de presentación de Escenara

Vídeo de unos 85 s (1920×1080, 30 fps) para el README y YouTube, hecho con
[Remotion](https://www.remotion.dev) de forma programática y reproducible.
Este directorio queda **fuera de los workspaces de bun**: tiene su propio
`package.json` y sus `node_modules` (ignorados por git).

Todo lo generado (voz, música, mezcla, recursos copiados, renders, modelo de
whisper) va a `salida/`, que está en `.gitignore`. En git solo hay código
fuente, guion, textos y documentación.

## Qué hay aquí

| Ruta | Para qué |
|---|---|
| `guion.json` | Guion aprobado: texto hablado (`locucion`) y texto de subtítulos (`subtitulo`) por escena. Solo se toca la puntuación. |
| `capturas.json` | Capturas reales usadas (con dimensiones y escena) y las descartadas con su motivo. |
| `scripts/locucion.mjs` | Genera la voz con Voicebox (perfil «Mi voz»), varias semillas por frase, las limpia y elige la mejor. |
| `scripts/audio.mjs` | Línea de tiempo (`tiempos.json`), música y efectos sintetizados, mezcla a −16 LUFS, `.srt` y capítulos. |
| `scripts/render.mjs` | Renderiza las dos versiones y la miniatura, y comprueba formato, tamaño y sonoridad. |
| `src/` | Composición Remotion: escenas, rótulos, infografías, ventanas con capturas, subtítulos. |
| `youtube.md` | Título, descripción con capítulos y etiquetas. |
| `LICENCIAS.md` | Procedencia y licencia de cada material. |

## Requisitos

- Node 22, `ffmpeg`/`ffprobe` y `whisper-cli` (whisper.cpp; en macOS `brew install whisper-cpp`).
- Voicebox abierto con el perfil «Mi voz» (solo para regenerar la locución). La
  app ya levanta su API local en `http://127.0.0.1:17493`; si no, se puede
  apuntar a otra con `VOICEBOX_URL`. El perfil se cambia con `VOICEBOX_PERFIL`.
- Sin claves ni créditos de ningún proveedor: todo es local.

## Regenerar

```bash
cd video
npm install
npm run modelo-whisper      # una vez: ~550 MB a salida/modelos
npm run preparar            # capturas, logotipos y fuentes → salida/publico
npm run locucion            # voz: 3 tomas por frase (salta las que ya existen)
npm run audio               # tiempos, música, efectos, mezcla, .srt, capítulos
npm run render              # MP4 con y sin subtítulos + miniatura + comprobaciones
```

Otras órdenes útiles:

- `npm run estudio`: Remotion Studio para revisar y ajustar a ojo.
- `npm run locucion -- --solo 05-direccion --semillas 5 --semilla-base 90`: rehacer una frase con semillas nuevas.
- `npm run locucion -- --reelegir`: volver a limpiar y elegir tomas sin generar nada.
- `node scripts/render.mjs --comprobar`: solo verificar los MP4 ya renderizados.
- `npm test` y `npm run typecheck`.
- `CAPTURAS_DIR=/otra/ruta npm run preparar`: leer las capturas de otra copia del repositorio.

## Cómo funciona la locución

- Una toma por frase y **varias semillas**; cada una se transcribe con whisper
  (local) y se compara con el guion.
- El clon de voz arrastra a veces una sílaba de la muestra de referencia al
  principio (whisper la oye como «Adiós,»). `locucion.mjs` la detecta por la
  envolvente (tramo corto seguido de un hueco) y la corta solo si la
  transcripción pasa a empezar por la primera palabra del guion.
- Se descartan tomas con la última palabra cortada (p. ej. «Escenar») o con
  silencios internos largos. Entre las válidas se queda la de duración mediana.
- Informe de cada toma en `salida/voz/informe.json`.

## Ritmo, mezcla y accesibilidad

- Cada escena dura lo que su frase más entrada (0,5 s) y respiración (1 s),
  con un mínimo de 5,5 s; el cierre deja 3,6 s para el logotipo.
- Rótulos, chips y efectos se sincronizan con las marcas de tiempo por palabra
  de la locución (`cuandoDice` en `src/tiempos.ts`).
- Música con ducking bajo la voz; mezcla final a −16 LUFS integrados y pico
  real ≤ −1,5 dBTP (loudnorm en dos pasadas). `render.mjs` falla si no cumple.
- Subtítulos incrustados con el mismo texto que el `.srt`, en una banda inferior
  reservada (el contenido no baja de 900 px).
- Sin destellos: una sola cortinilla por cambio de escena (16 cuadros).
- La escena de costes es una «zona de claridad»: fondo sobrio y sin texto sobre degradado.
