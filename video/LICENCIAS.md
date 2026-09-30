# Licencias y procedencia del material

Nada del vídeo usa pistas comerciales ni bancos de sonido o imagen de terceros.

| Material | Procedencia | Licencia |
|---|---|---|
| Locución | Voz sintética de ElevenLabs de la biblioteca compartida (Voice Library): «Martin Osborne - Polished and Energetic», voice_id `D7dkYvH17OKLgp4SLulf`, publicada por su autor en la biblioteca; modelo `eleven_multilingual_v2`. Una sola voz en todo el vídeo. | Según los términos de ElevenLabs y el plan del propietario: el uso comercial y la atribución dependen de ese plan, que no se puede consultar con la clave del proyecto (sin permisos de lectura de usuario). Revisarlo antes de publicar. |
| Locución anterior (retirada) | Voz del autor con Voicebox; conservada solo en `salida/anterior-voicebox/`, no se usa en el vídeo. | Del autor. |
| Música | Original, sintetizada por `scripts/musica.mjs` + `scripts/sintesis.mjs` (osciladores, ruido y filtros; sin muestras). | Parte del repositorio (misma licencia que el código). |
| Efectos (whoosh, pop, clic, campanita, subidón, impacto) | Originales, sintetizados por `scripts/sintesis.mjs`. | Parte del repositorio. |
| Capturas de la interfaz | `docs/assets/capturas` (aplicación real). Selección y motivos de exclusión en `capturas.json`. | Parte del repositorio. |
| Fotogramas ilustrados de «Nora» | Generados con IA dentro de Escenara en un proyecto de prueba (dentro de las capturas 0.31.0). Personaje ilustrado, sin cara real. | Parte del repositorio. |
| Logotipos | `docs/branding` (identidad «Enfoque»). | Marca de Escenara. |
| Tipografía Manrope | Paquete `@fontsource/manrope`. | SIL Open Font License 1.1. |
| Remotion | Motor de render (`remotion`, `@remotion/*`). | Licencia de Remotion: gratuita para personas y empresas de hasta 3 empleados; revisar https://www.remotion.dev/license si cambia la situación. |
| Modelo de transcripción | `ggml-large-v3-turbo-q5_0.bin` de whisper.cpp (solo para validar tomas y sincronizar; no aparece en el vídeo). | MIT (whisper / whisper.cpp). |
