# Briefing · Tutorial «Crear un personaje»

## Prompt y decisiones del propietario

- **Propósito**: tutorial para la documentación y para la lista pública de YouTube.
- **Público**: personas que acaban de empezar con Escenara.
- **Realista (cambio del 2026-10-16)**: el vídeo enseña la creación de verdad. Se pulsa «Crear el personaje
  inventado», se entra en su ficha, se generan de verdad los retratos y las vistas con KIE, se espera a que el
  worker los procese y se enseña el resultado real. Gastar créditos de KIE está autorizado con un tope de
  **150 créditos por vídeo**, reintentos incluidos. Los vídeos sirven también como prueba completa de la app:
  si algo falla o no hace caso a lo elegido, no se arregla en el código, se apunta con evidencia.
- **Estilo**: el vibrante de la marca Escenara → `direccion: dinamica`, cámara `acercamiento` en las pantallas
  con clic y títulos `arriba`.
- **Voz**: femenina, de España, ElevenLabs `eleven_multilingual_v2`, «Lydia» (`SDVJaMLoJa7wc3s2sn7d`). No se
  genera hasta que el propietario apruebe el guion nuevo.
- **Música**: suave, por debajo de la voz (100 BPM, Re mayor, semilla 3).
- **Duración**: entre 90 y 150 s (estimada: ~117 s; la pasada sin voz dio 115,8 s). Siempre salen las versiones con y sin subtítulos.
- **Contenido**: solo sintético.

## Decisiones mías

- **Camino**: solo el del personaje **inventado**, de principio a fin: nuevo personaje → inventado → nombre y
  descripción → estilo → declaración → crear → ficha → completar la ficha con IA y guardarla → elegir 3 retratos,
  ver su coste y generarlos → elegir su cara → coste y generación de las vistas que faltan → resultado.
- **Orden cambiado respecto a la guía de la ficha** (retratos → cara → ficha → vistas): la ficha se completa
  **antes** de los retratos. Al guardar la ficha de un inventado, la app toma siempre el estilo como cambiado y
  borra sus referencias y descarta sus retratos (fallo apuntado en el informe); con la ficha primero no hay nada
  que perder. Cuando se arregle, conviene volver al orden de la guía.
- **3 retratos, no 4**: el tope de trabajos simultáneos por usuario es 3 por defecto y el cuarto se rechaza
  siempre (fallo apuntado). Se eligen 3 en el selector, que también enseña que se puede pedir de uno a cuatro.
- **Vistas**: «Generar las 4 vistas que faltan» encarga 3 o 4 según lo rápido que vaya el encargo, por el mismo
  tope. La captura de resultado espera a «4 o 5 vistas generadas», así sale en los dos casos; si se rechaza una,
  la imagen de después lo dice con su motivo, tal cual lo enseña la app.
- **Persona o animal reales**: no se graba (exige fotos reales con consentimiento). Queda como mención breve en
  la escena `nuevo`, sobre la pantalla que enseña los dos caminos, sin rellenar nada. Pendiente de confirmar con
  el propietario (ver preguntas en el informe).
- **Personaje**: «Brisa», inventada, sin parecido con nadie real: mujer de unos veintiocho años, pelo rizado
  cobrizo recogido en un moño alto, pecas, gafas redondas de pasta verde, jersey de punto mostaza y sonrisa
  tranquila. Estilo realista (el de por defecto).
- **Cuenta**: **Tutoriales** (`ESCENARA_TUTORIALES_EMAIL` y `ESCENARA_TUTORIALES_PASSWORD`), usuario normal sin
  administración.
- **Estado inicial conocido**: `app.preparacion` ejecuta `apps/web/scripts/reiniciar-tutorial-personaje.ts
  --cuenta tutoriales@escenara.test --nombre Brisa`. Borra, con el mismo borrado que usa la app, los personajes
  **inventados** llamados exactamente «Brisa» de esa cuenta, y nada más. Se niega si la cuenta no es de un
  dominio reservado para pruebas o si tiene administración. Antes de borrar imprime el gasto de sus trabajos,
  porque con el personaje desaparecen sus filas de `generation_jobs`. Si un trabajo anterior sigue en el
  proveedor, espera hasta 8 minutos a que termine.
- **Cada pasada con capturas cuesta créditos**: unos 24 a 28 reales (3 retratos y 3 o 4 vistas a 4 créditos),
  más 2 si la traducción cae en KIE porque NaN builders no responde.
  Para la versión con voz, usa `pnpm video --sin-capturas` si las capturas ya están bien: así no se vuelve a
  crear ni a generar nada.
- **Esperas**: las capturas de resultado (`retratos-resultado` y `vistas-resultado`) usan `esperar` con
  `espera` de 10 minutos y `recargar` cada 20 s. Las capturas que encargan algo esperan con `pasosDespues` a que
  termine el envío (hasta 5 minutos, porque la traducción previa puede tardar) y se desplazan hasta el aviso: el
  vídeo enseña «3 retratos en marcha» o «Se han encargado…» y luego el resultado; la espera no sale.
- **Red**: siguen bloqueados con 403 los borrados (`DELETE /api/personajes**`) y lo que no forma parte del flujo:
  `POST /api/generacion/**`, consentimiento, escenas habladas (`omni`), hoja de identidad, vista suelta
  (`vista-sintetica`) y referencias. Crear, generar retratos, elegir, proponer la ficha, guardarla y generar las vistas pasan.
- **Web**: graba contra el `next dev` del propietario en el 3021. El indicador de desarrollo
  (`nextjs-portal`) se difumina con `ocultar` en todas las capturas. La versión final conviene grabarla con el
  build de producción, y entonces hay que quitar `nextjs-portal` de `ocultar` (con el build de producción no
  existe y el motor da error si un selector de `ocultar` no aparece).
- **URL local**: `sustituirTextos` cambia `http://localhost:3021` por `https://escenara.com`.
- **Marca**: `salidas/escenara/marca.json` del motor (Manrope, `#2753d7`, fondo `#f7f8fc`, texto `#182032`),
  coral `#f0663d` y fucsia `#e8458b` de `docs/branding/ESCENARA_BRAND_GUIDE.md`.

## Evidencia de cada afirmación

Rutas relativas a `apps/web/src/` salvo que se indique otra cosa.

| Escena | Afirmación | Evidencia |
|---|---|---|
| gancho | La misma cara en todos tus vídeos | `panel-cobertura.tsx` («Con estas vistas el parecido se mantiene entre fotogramas») y `docs/guias/crear-un-personaje.md` |
| nuevo | Botón «Nuevo personaje» en Personajes | `app/personajes/page.tsx` |
| nuevo | Persona o animal reales: fotos y consentimiento | `app/personajes/nuevo/_componentes/alta-personaje.tsx` (pasos de fotos y consentimiento) y `MOTIVO_SIN_FOTOS_REALES` en `lib/omni.ts` |
| nuevo | Camino del inventado | `app/personajes/nuevo/page.tsx` («¿No es una persona real?» → `/personajes/nuevo/inventado`) |
| nombre | Nombre; descripción con edad, pelo, ropa y gesto; de ahí salen sus retratos | `app/personajes/nuevo/inventado/_componentes/alta-personaje-inventado.tsx`, ayuda del campo «Descripción» |
| descripcion | Aviso mientras se escribe si nombra a alguien real | `alta-personaje-inventado.tsx` (`nombresRealesEn` y su `Aviso`; misma lista que el servidor) |
| estilo | Realista, ilustración plana, 3D estilizado o anime | `campos-estilo-animado.tsx` con las opciones de `server/prompts/presets.json`; captura `inventado-estilo.despues.png` |
| crear | Declaración y botón «Crear el personaje inventado» | `DECLARACION_PERSONAJE_INVENTADO` en `lib/omni.ts`; botón del paso 4 de `alta-personaje-inventado.tsx` |
| ficha-nueva | La ficha guía con lo que falta: retratos, cara, ficha y vistas | `app/personajes/[id]/_componentes/pasos-inventado.tsx` |
| precio | De uno a cuatro retratos; coste en créditos de la cuenta de KIE antes de generar | `panel-retratos.tsx` (selector «Retratos que quieres generar» de 1 a `RETRATOS_CANDIDATOS`, botón «Ver lo que cuesta…» antes de «Generar») y `components/ui/coste.tsx` («Se paga con los créditos de tu cuenta de KIE, no con los de Escenara») |
| generar-retratos | Confirmar derechos; cada retrato se encola y se cobra por separado | `panel-retratos.tsx` (casilla «Puedo usar lo que se genere con esta descripción» y texto del total) |
| elegir | Aparecen al terminar; el elegido es su cara; el resto, en la biblioteca | `panel-retratos.tsx` (candidatos de la página, «Elegir este» y descripción del panel) |
| ficha-ia | Propone rasgos, estilo, vestuario, personalidad y voz | `dialogo-ficha-ia.tsx` y `CAMPOS_FICHA` / `ETIQUETA_CAMPO_FICHA` en `lib/ficha-personaje.ts` |
| guardar | Se acepta campo a campo y se guarda con «Guardar la ficha» | `dialogo-ficha-ia.tsx` («Aceptar N campos»; «la versión nueva la crea "Guardar la ficha"») y `panel-ficha.tsx` |
| vistas | Perfiles, tres cuartos y cuerpo completo, con el total delante antes de encargarlas | `VISTAS_MINIMAS.persona` en `lib/captura-personaje.ts`; `dialogo-todas-las-vistas.tsx` (total estimado) |
| vistas-listas | Con las vistas se mantiene el parecido | `panel-cobertura.tsx` |
| resultado | Brisa lista para sus escenas | Insignia «Listo» y botón «Generar con él» en la ficha (`ficha-personaje.tsx`); captura `ficha-final.png`. Ojo: la columna `characters.state` sigue en `borrador` |
| cierre | La guía está en la documentación | `docs/guias/crear-un-personaje.md`, publicada en `docs.escenara.com` |
