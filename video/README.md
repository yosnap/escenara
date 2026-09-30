# Vídeo de presentación de Escenara

Vídeo de unos 88 s (1920×1080, 30 fps) para el README y YouTube, hecho con
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
| `scripts/locucion.mjs` | Genera la locución (una toma por frase), la valida con whisper y la limpia. |
| `scripts/motores-voz.mjs` | Motores de voz: ElevenLabs (por defecto, con tope de caracteres) y Voicebox (opcional). |
| `scripts/audio.mjs` | Línea de tiempo (`tiempos.json`), música y efectos sintetizados, mezcla a −16 LUFS, `.srt` y capítulos. |
| `scripts/render.mjs` | Renderiza las dos versiones y la miniatura, y comprueba formato, tamaño y sonoridad. |
| `src/` | Composición Remotion: escenas, rótulos, infografías, ventanas con capturas, subtítulos. |
| `youtube.md` | Título, descripción con capítulos y etiquetas. |
| `LICENCIAS.md` | Procedencia y licencia de cada material. |

## Requisitos

- Node 22, `ffmpeg`/`ffprobe` y `whisper-cli` (whisper.cpp; en macOS `brew install whisper-cpp`).
- Solo para regenerar la locución, **una sola voz en todo el vídeo**:
  - ElevenLabs (por defecto): voz «Martin Osborne - Polished and Energetic»
    (`D7dkYvH17OKLgp4SLulf`), modelo `eleven_multilingual_v2`, `es`,
    stability 0.5, similarity_boost 0.8, style 0.3. La clave se pasa **solo**
    por la variable de entorno `ELEVENLABS_API_KEY` (nunca en ficheros ni en
    `.env` versionados), p. ej. `ELEVENLABS_API_KEY=… npm run locucion`. Gasta
    caracteres de la cuenta del propietario: una toma por frase (~1.000
    caracteres el guion completo), repeticiones solo si whisper detecta un
    error (máx. 2 por frase) y tope de 3.000 (`--tope`), con registro en
    `salida/voz/elevenlabs/gasto.json`.
  - Voicebox (opcional, `--motor voicebox`): API local de la app en
    `http://127.0.0.1:17493` (`VOICEBOX_URL`, `VOICEBOX_PERFIL`).
- `VIDEO_SALIDA=/ruta/absoluta/salida`: usa otra carpeta de salida (p. ej. la
  del checkout principal desde un worktree). Scripts y Remotion la respetan.

## Regenerar

```bash
cd video
npm install
npm run modelo-whisper      # una vez: ~550 MB a salida/modelos
npm run preparar            # capturas, logotipos y fuentes → salida/publico
ELEVENLABS_API_KEY=… npm run locucion   # voz: una toma por frase (salta las que ya existen)
npm run audio               # tiempos, música, efectos, mezcla, .srt, capítulos
npm run render              # MP4 con y sin subtítulos + miniatura + comprobaciones
```

Otras órdenes útiles:

- `npm run estudio`: Remotion Studio para revisar y ajustar a ojo.
- `npm run locucion -- --solo 05-direccion --semillas 2`: añadir una toma con otra semilla (reutiliza la existente sin pagarla).
- `npm run locucion -- --reelegir`: volver a limpiar y elegir tomas sin generar nada.
- `node scripts/render.mjs --comprobar`: solo verificar los MP4 ya renderizados; `--sin-miniatura` no la vuelve a generar.
- `npm test` y `npm run typecheck`.
- `CAPTURAS_DIR=/otra/ruta npm run preparar`: leer las capturas de otra copia del repositorio.

## Cómo funciona la locución

- Cada toma se transcribe con whisper (local) y se compara con el guion; se
  recortan los silencios de inicio y final.
- Con Voicebox se generan varias semillas por frase. El clon de voz arrastra a veces una sílaba de la muestra de referencia al
  principio (whisper la oye como «Adiós,»). `locucion.mjs` la detecta por la
  envolvente (tramo corto seguido de un hueco) y la corta solo si la
  transcripción pasa a empezar por la primera palabra del guion.
- Se descartan tomas con la última palabra cortada (p. ej. «Escenar») o con
  silencios internos largos. Entre las válidas se queda la de duración mediana.
- Informe de cada toma en `salida/voz/elevenlabs/informe.json` (o `salida/voz/informe.json` con Voicebox).
- «trend» suele transcribirse «tren» (la «d» final apenas suena): la sincronía se ancla a «tren», que casa con ambas.

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
