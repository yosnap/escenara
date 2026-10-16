# Briefing · Tutorial «Crear un personaje» (modo tutorial)

## Prompt y decisiones del propietario

- **Estilo «tutorial» (2026-10-16)**: tiene que parecer una persona usando la app, no un anuncio.
  - Formato 16:9, 1920×1080. La app se graba siempre en móvil y su pantalla va fija en el centro, sobre el fondo
    de la marca. No hay marcos que vuelan, ni 3D, ni cámaras que se mueven. Entre escenas hay corte o fundido corto.
  - Cada toque deja una onda en su punto. El texto se ve aparecer al escribir. Al elegir, una ventana muestra las
    opciones y resalta la elegida.
  - La zona tocada recibe el foco: el resto se oscurece y la zona se acerca un poco.
  - Las esperas largas se recortan con «Unos segundos después» o «N minutos después».
  - El motor lo hace con `"direccion": "tutorial"` y la pieza `tutorial` (rama `feat/modo-tutorial` del motor).
- **Caminos**:
  - **Inventado**, de principio a fin, con retratos y vistas reales.
  - **Mascota**, con 3 o 4 fotos de un perro inventado generadas con IA.
  - **Persona real**: solo una mención breve.
- **Propósito**: tutorial para la documentación y para la lista pública de YouTube. Público: quien empieza con Escenara.
- **Sin voz (decisión del 2026-10-17)**: el entregable es el MP4 sin voz (`"voz": { "proveedor": "ninguna" }`).
  - Cada escena lleva un rótulo breve (`titulo`) al lado del móvil, y las frases salen como subtítulos en la
    versión con subtítulos, que es la recomendada.
  - La duración de cada escena sale del tiempo de lectura y de sus acciones.
  - Antes estaba prevista la voz Lydia (`SDVJaMLoJa7wc3s2sn7d`). Sus tomas quedan sin aprobar y no se usan.
- **Gasto de KIE**: autorizado con un tope de 150 créditos por vídeo, reintentos incluidos (decisión del vídeo
  anterior). Si algo de la app falla, no se arregla en el código: se apunta con evidencia.
- **Contenido**: solo sintético. La cara de Brisa se genera y Lupo es un perro inventado.
- **Grabación final**: después de integrar los arreglos de la app de la 0.52.6. No antes.
- **Decisiones del 2026-10-16, 23:35**:
  - Se acepta a Lupo como mascota de demostración, marcando «Un animal mío» en la cuenta Tutoriales.
  - Las fotos de Lupo se generan con IA una sola vez.
  - Tope de 80 créditos de KIE para la grabación final, con fotos y reintentos.
  - «Declaro que es mayor de edad» para una mascota es un fallo de la app: se apunta y no se arregla.

## Decisiones mías

- **Cinco grabaciones** en lugar de una:
  - `inventado-alta`: del alta a la guía de la ficha.
  - `inventado-retratos`: cuántos retratos, coste, generarlos y elegir la cara.
  - `inventado-ficha`: completar la ficha con IA y guardarla.
  - `inventado-vistas`: generar las vistas que faltan y su resultado.
  - `mascota`.

  Cada grabación que sigue con Brisa la abre antes desde la lista, con `pasos` que no se ven. Empieza en la misma
  pantalla en la que acabó la anterior, así que el corte no se nota. Si una falla, se repite solo esa sin borrar a
  Brisa (ver «Cómo grabar»).
- **Orden de la guía de la ficha**: retratos → cara → ficha → vistas. La 0.52.6 arregla que guardar la ficha
  borrara la cara.
- **3 retratos**: el selector enseña que se pueden pedir de uno a cuatro. Elijo 3 porque es lo que cabe en el tope
  de 3 trabajos simultáneos; la app avisa de ello.
- **Vistas en dos tandas**: faltan 5 y caben 3 a la vez, así que se encargan 3 y, cuando terminan, las 2 que
  faltan. Así el vídeo acaba en «Todas las vistas cubiertas» y no en «Faltan N». La escena `vistas-resto` lo
  explica.
- **Avisos que dependen del importe**, como «Sí, quiero gastar…» o «Lo he leído y quiero generar igualmente»: van
  con `siExiste`. Si no salen, ese momento queda quieto, aunque suena el toque.
- **Esperas de generación**: se espera con recarga cada 20 s, hasta 10 minutos, y tras cada recarga se vuelve a
  abrir «Retratos y vistas». Es `trasRecargar`, porque la pestaña no sobrevive a una recarga
  (`components/ui/overlay.tsx`, `Pestanas` con `defaultValue`). En el vídeo, la espera sale recortada con su
  rótulo.
- **Personajes**:
  - **Brisa**: la del vídeo anterior, inventada y sin parecido con nadie. Mujer de unos veintiocho años, pelo
    rizado cobrizo en un moño alto, pecas, gafas redondas verdes, jersey mostaza. Estilo realista.
  - **Lupo**: perro mestizo inventado, de pelo canela con una mancha blanca en el pecho, orejas caídas y collar rojo.
- **Fotos de Lupo**: se generan fuera del alta y se suben como ficheros desde `mascota/fotos/`, con la acción
  `subir` del motor. Si se eligieran desde la biblioteca después de generarlas en Escenara, la app las tomaría como
  «vista generada» y no como foto (`server/personajes/servicio.ts:361-462`), y no contarían para el mínimo de 3.
  Cómo generarlas y lo que cuesta: `mascota/prompts.md`.
- **Cuenta**: Tutoriales (`ESCENARA_TUTORIALES_EMAIL` y `ESCENARA_TUTORIALES_PASSWORD`), sin administración.
- **Estado inicial**: `app.preparacion` ejecuta `reiniciar-tutorial-personaje.ts --nombre Brisa --mascota Lupo`.
  Borra, con el borrado de la app, las Brisas inventadas y el animal «Lupo» de la cuenta Tutoriales, y nada más.
- **Red**:
  - Siguen bloqueados con 403 los borrados y lo que no forma parte del flujo: `POST /api/generacion/**`, `omni` y
    hoja de identidad.
  - Ahora pasan consentimiento y referencias, porque la mascota los necesita.
- **Web**:
  - Graba contra el `next dev` del 3021 y difumina `nextjs-portal`.
  - Con el build de producción hay que quitar ese `ocultar`: si el selector no sale en ninguna imagen, la
    grabación se para.
  - `sustituirTextos` cambia la URL local por `https://escenara.com`.
- **Marca**: la del vídeo anterior (Manrope, `#2753d7`, fondo `#f7f8fc`). Música suave a 100 BPM en Re mayor,
  por debajo de la voz.
- **Duración**: de 150 a 270 s. La estimada sin voz es de ~202 s, y la real depende de la locución.

## Prueba de humo (sin gastar)

En `prueba-humo/` está el arranque del camino inventado: «Nuevo personaje», el tipo con su ventana de opciones,
el nombre y la descripción escribiéndose y el estilo con su ventana. Hay además una grabación del camino de la
mascota hasta antes de subir fotos, que comprueba sus selectores. Bloquea con 403 cualquier escritura de
personajes, generación o medios. Se graba con `--sin-voz`.

## Cómo grabar la versión final

1. Las fotos de Lupo ya están en `mascota/fotos/` (generadas el 2026-10-16 con la cuenta Tutoriales, 16 créditos).
   Se reutilizan.
2. Desde el motor (`feat/modo-tutorial`): `pnpm preparar --video <esta carpeta>`. Revisa la hoja de contactos.
3. Si falla una grabación, repítela sola sin borrar lo creado:
   `pnpm preparar --video <esta carpeta> --solo <id> --sin-preparacion`. Ojo: repetir `inventado-retratos` o
   `inventado-vistas` vuelve a gastar.
4. Voz, después del visto bueno del guion: `pnpm video --video <esta carpeta> --sin-capturas`. Así no se vuelve a
   crear ni a gastar nada.

## Evidencia de cada afirmación

Rutas relativas a `apps/web/src/` salvo que se indique otra cosa.

| Escena | Afirmación | Evidencia |
|---|---|---|
| gancho | La misma cara en todos tus vídeos | `panel-cobertura.tsx` («Con estas vistas el parecido se mantiene entre fotogramas») y `docs/guias/crear-un-personaje.md` |
| nuevo | Botón «Nuevo personaje» en Personajes | `app/personajes/page.tsx:35-36` |
| tipo | Persona o animal reales: fotos y consentimiento | `app/personajes/nuevo/page.tsx` («Necesitas N fotos de referencia y el consentimiento») y `alta-personaje.tsx` (pasos 2 y 3) |
| tipo | Camino del inventado | `app/personajes/nuevo/page.tsx` («¿No es una persona real?» → `/personajes/nuevo/inventado`) |
| datos | Nombre; descripción con edad, pelo, ropa y gesto; de ahí salen sus retratos | `alta-personaje-inventado.tsx`, ayuda del campo «Descripción» («De aquí salen sus retratos…»; captura de la prueba de humo) |
| datos | Aviso mientras se escribe si nombra a alguien real | `alta-personaje-inventado.tsx:51` (`nombresRealesEn` y su `Aviso`) |
| estilo | Realista, ilustración plana, 3D estilizado o anime | `campos-estilo-animado.tsx` con `server/prompts/presets.json`; la grabación de humo lee esas 4 opciones del desplegable |
| crear | Declaración y botón «Crear el personaje inventado» | `DECLARACION_PERSONAJE_INVENTADO` en `lib/omni.ts`; paso 4 de `alta-personaje-inventado.tsx` |
| guia | La ficha guía con lo que falta: retratos, cara, ficha y vistas | `app/personajes/[id]/_componentes/pasos-inventado.tsx` |
| retratos | De uno a cuatro retratos; coste antes de generar | `panel-retratos.tsx:28-31` (`OPCIONES_CANTIDAD` de 1 a `RETRATOS_CANDIDATOS`), «Ver lo que cuesta generar…» (`:252`) antes de «Generar» (`:314`) |
| generar | Confirmar derechos; cada retrato se encola y se cobra por separado | `panel-retratos.tsx:270-273` (texto del total y casilla «Puedo usar lo que se genere con esta descripción») |
| cara | Aparecen al terminar; el elegido es su cara; el resto, en la biblioteca | `panel-retratos.tsx:126` («Cuando terminen aparecerán aquí al recargar la página»), `:166` («los demás se quedan en tu biblioteca»), `:225` («Elegir este») |
| ficha-ia | Propone rasgos, estilo, vestuario, personalidad y voz | `dialogo-ficha-ia.tsx` y `CAMPOS_FICHA` / `ETIQUETA_CAMPO_FICHA` en `lib/ficha-personaje.ts` |
| ficha-guardar | Se acepta lo que convence y se guarda con «Guardar la ficha» | `dialogo-ficha-ia.tsx` («Aceptar»; la versión nueva la crea «Guardar la ficha») y `panel-ficha.tsx` |
| vistas | Perfiles, tres cuartos y cuerpo completo; total antes de encargarlas | `VISTAS_MINIMAS.persona` en `lib/captura-personaje.ts`; `dialogo-todas-las-vistas.tsx:116-186` (título, total y «Generar las N vistas») |
| vistas-resto | Como mucho tres a la vez; luego se encargan las que faltan | `trabajosSimultaneos: 3` en `server/ajustes.ts`; aviso «esta instalación permite 3 a la vez» de `panel-retratos.tsx` y título «Generar N de las M vistas que faltan» de `dialogo-todas-las-vistas.tsx:133` |
| vistas-listas | Con las vistas se mantiene el parecido | `panel-cobertura.tsx` («Todas las vistas cubiertas») |
| mascota-tipo | Volver a «Nuevo personaje» y elegir «Animal» | `alta-personaje.tsx:137-150` (`GrupoOpciones` con «Persona» y «Animal», `ETIQUETA_TIPO_PERSONAJE` en `lib/personajes.ts:21-24`) |
| mascota-datos | Nombre, especie o raza opcional y descripción de lo que no cambia | `alta-personaje.tsx:151-191` («Especie o raza (opcional)», «Descripción (opcional)»: «describe lo que no debería cambiar entre escenas») |
| mascota-fotos | Mínimo de tres fotos, con luces y ángulos distintos, para mantener la cara | `alta-personaje.tsx:195-205` («Fotos del personaje (mínimo N)» y su ayuda); `minimoReferenciasPersonaje: 3` en `server/ajustes.ts:450` |
| mascota-consentimiento | «Un animal mío»: basta con tu declaración | `ETIQUETA_TITULAR.animal_propio` y `DESCRIPCION_TITULAR.animal_propio` en `lib/personajes.ts:60-73` |
| mascota-crear | «Crear el personaje» y su ficha con las fotos como referencia | `alta-personaje.tsx:84-132` (crea, añade las referencias, registra el consentimiento y abre `/personajes/{id}`) |
| cierre | La guía está en la documentación | `docs/guias/crear-un-personaje.md`, publicada en `docs.escenara.com` |

## Cosas de la app vistas al preparar esto (sin tocar el código)

- Para una mascota, el alta exige marcar «Declaro que es mayor de edad», y la ayuda habla de «la persona que
  aparece en las fotos». Viene de `bloqueosDeConsentimiento` en `formulario-consentimiento.tsx:55-61`, que no
  mira el titular. La grabación toca la casilla con `siExiste`, así que también funciona si se quita para animales.
