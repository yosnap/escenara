# Tus datos: historial, exportación y borrado

Todo lo que haces en Escenara es tuyo: puedes ver qué has hecho y cuánto ha costado, llevarte tus proyectos en un ZIP
y borrar lo que quieras, hasta la cuenta entera. Esta guía explica cada cosa y, sobre todo, **qué se borra y qué se
conserva**.

## Tu historial

Hay dos historiales, los dos de solo lectura:

- **El del proyecto**: en la pantalla del proyecto, **«Historial y gasto»**. Cada fotograma, clip y voz generados,
  cada revisión, cada montaje y cada paquete exportado de ese proyecto, con su fecha, su estado y sus créditos.
- **El de tu cuenta**: en **Tu cuenta › Tus datos › «Ver tu historial y tu gasto»**. Lo mismo para todos tus
  proyectos y para lo que hiciste en «Crear» sin proyecto.

Arriba está el **gasto por mes** (y por proyecto, en el de la cuenta) con dos cifras:

- **Estimado**: lo que se reservó al pedir, antes de saber el precio final.
- **Consumido**: lo que costó de verdad, con los ajustes que haya hecho quien administra. Los euros son
  orientativos: salen del cambio que había configurado cuando se apuntó cada gasto.

Puedes filtrar por tipo (generaciones, revisiones, montajes, exportaciones), por mes y, en el de la cuenta, por
proyecto. El historial va por páginas de 30: **«Más antiguos»** y **«Más recientes»**. Cada línea enlaza a su
resultado (el archivo generado, la revisión o la descarga del ZIP).

Cuando algo falló, se dice **la causa concreta** (el proveedor rechazó el contenido, faltaba saldo, la clave no vale…),
igual que en «Crear». Nunca sale el texto en bruto del proveedor ni el prompt que se envió.

## Exportar un proyecto

En la pantalla del proyecto, **«Exportar proyecto»**. El paquete lo prepara el worker, así que tarda un poco: la
pantalla dice si está **en cola** o **preparándose**, y cuando está listo aparece **«Descargar ZIP»** con su tamaño.

Qué lleva el ZIP:

| Carpeta o archivo | Qué es |
|---|---|
| `proyecto.json` | El proyecto, sus escenas con su guion y su dirección, el montaje, las revisiones y el gasto en créditos. Sigue un esquema con versión (hoy la 1) y cita cada medio con su ruta y su huella SHA-256. |
| `medios/escena-01/`… | El fotograma aprobado, el clip, la voz, la canción y la imagen de referencia de cada escena. |
| `medios/musica/` | La música del montaje. |
| `medios/montaje/` y `subtitulos/` | Los vídeos montados (con su etiqueta de contenido sintético) y sus subtítulos SRT y VTT. |
| `LEEME.md` | Qué hay dentro, en castellano. |

Qué **no** lleva, a propósito: **ninguna clave, contraseña, credencial ni cabecera de autenticación** (se filtra
también si pegaste una clave en el guion: aparece como `[retirado]`), los prompts que se enviaron a los proveedores,
las fotos de referencia y los documentos de consentimiento de tus personajes, ni nada de otra cuenta.

Límites, con su causa si los pasas (los fija quien administra en **Admin › Ajustes › Tus datos**):

- **Tamaño máximo** del ZIP (2048 MB de fábrica). Si el proyecto no cabe, se dice cuánto ocupa.
- **Exportaciones por día** (10 de fábrica). Mientras una se prepara, pedir otra devuelve la misma.
- **Caducidad** de la descarga (24 horas de fábrica). Después el paquete se borra solo y hay que volver a exportar.
  El enlace de descarga es temporal y nunca dura más que el paquete.

Exportar **no cuesta créditos** ni llama a ningún proveedor. Por ahora el ZIP es para guardarlo o llevártelo: todavía
no se puede volver a importar en Escenara.

## Borrar un proyecto

En la pantalla del proyecto, **«Borrar proyecto»**. Antes de confirmar, el diálogo enumera con cifras qué se borra y
qué se queda.

**Se borra**, en la base de datos y en el almacenamiento: el proyecto con sus escenas, guion, revisiones, brief y
montaje; sus trabajos de generación; los fotogramas, clips y voces generados en él; los vídeos montados; y los ZIP
exportados.

**Se queda**:

- lo que **subiste tú** (fotos de referencia, audios, música): sigue en tu biblioteca;
- un clip que hiciste en **«Crear»** y convertiste en este proyecto: vuelve a «Crear», con su archivo, y se puede
  volver a convertir;
- un archivo generado que **usas fuera** del proyecto (como foto de un personaje, un producto o un lugar, en una
  colección o en otro proyecto);
- los **apuntes de gasto**: el gasto ocurrió y sigue en el historial de tu cuenta, diciendo de qué proyecto venía.

Si el almacenamiento no deja borrar algún archivo en ese momento, queda apuntado y el worker lo reintenta solo hasta
borrarlo; no se queda en el almacenamiento sin que nadie lo sepa.

No se puede borrar mientras un trabajo del proyecto esté ya en el proveedor (se va a cobrar y su resultado va a llegar)
o mientras se monta un vídeo o se prepara un paquete: espera a que termine. Lo que estaba en cola sin salir se cancela
y su reserva vuelve a tu presupuesto.

## Borrar personajes, productos y lugares

Cada uno tiene su propio **«Borrar»** en su ficha, con su diálogo:

- **Personaje**: se borran él, su consentimiento, sus versiones, sus hojas de personaje y todo lo generado con él
  (fila y archivo). Es una persona: lo hecho con su cara no sobrevive. Ver [Crear un personaje](crear-un-personaje.md).
- **Producto** y **lugar**: se borra la ficha; lo generado con ellos y sus fotos **se quedan** en tu biblioteca. Las
  declaraciones de un lugar se conservan revocadas (son la prueba de lo que declaraste). Ver [Presentar un
  producto](productos.md) y [Lugares](lugares.md).

## Tus publicaciones en la comunidad

Lo que publicas en la [comunidad](comunidad.md) es una **copia**: retirarla la borra y tu original no cambia. Si borras
el original (el personaje, el archivo o su proyecto), su publicación deja de verse al momento y se borra con su copia
en unos minutos. Tus publicaciones (con su estado y el motivo de un rechazo) y tus logros se descargan en JSON desde
**Comunidad › Tus publicaciones › Descargar** (también durante el periodo de gracia, desde «Tu cuenta se va a
borrar»), y el ZIP de un proyecto incluye `comunidad.json` con las que salen de ese proyecto.

## Borrar tu cuenta

En **Tu cuenta › Tus datos › «Borrar mi cuenta»**. Es irreversible, así que tiene varias salvaguardas:

1. **Tienes que haber entrado hace poco** (menos de 10 minutos) con tu contraseña o tu passkey. Si no, el diálogo
   ofrece **«Volver a entrar y seguir aquí»**.
2. El diálogo **enumera todo lo que desaparece**, con cifras, y te ofrece **exportar cada proyecto** antes.
3. Hay que **escribir «borrar mi cuenta»**.
4. Hay un **periodo de gracia** (7 días de fábrica). Durante ese tiempo tu cuenta queda **desactivada**: tus demás
   sesiones se cierran, lo que estaba en cola se cancela y **no puedes generar, gastar, editar ni subir nada**, ni
   cambiar tu correo o añadir passkeys. Si
   entras, llegas a **«Tu cuenta se va a borrar»**, donde ves la fecha, puedes **cancelar el borrado**, ver tu historial
   y **pedir y descargar el ZIP de cada proyecto** (la portabilidad no se corta por haber pedido el borrado).
5. Si eres **el único administrador** (sin contar a los que ya tienen su borrado programado), no puedes borrarte:
   antes tiene que haber otra cuenta con ese rol. Hoy se asigna en la base de datos
   (`update users set role = 'admin' where email = '…'`), con la copia hecha.
6. Si eres administrador y publicaste **ejemplos de plantillas** de la instalación, el diálogo te avisa: esas
   plantillas se quedan sin ejemplo (no se borran).
7. Tus **publicaciones de la comunidad** dejan de verse desde que pides el borrado, y se borran con sus copias al
   terminar el plazo. Si cancelas, vuelven a verse tal como estaban.

Pasado el plazo, el worker borra las filas **en una sola operación**: si algo falla a mitad, no se borra nada y lo
vuelve a intentar más tarde. Después borra los archivos; los que el almacenamiento no deja borrar quedan apuntados y se
reintentan solos, y quien administra los ve si se atascan.

Si hay un trabajo tuyo en el proveedor, el borrado espera y **te dice por qué** en «Tu cuenta se va a borrar» (y quien
administra lo ve en Admin › Ajustes › Tus datos). Un trabajo del que el proveedor no ha contestado ya salió y pudo
cobrarse: solo retiene el borrado unos días más (3 de fábrica). Después se pregunta al proveedor una última vez y, si
sigue sin contestar, su coste estimado se apunta como **no confirmado** y el borrado sigue.

Al pedir el borrado y al cancelarlo te llega un **correo**. Si no has sido tú, tienes dos salidas: **entra y
cancélalo**, o **restablece tu contraseña** desde «He olvidado mi contraseña» (sirve aunque alguien te la haya
cambiado): restablecerla **cancela el borrado** y cierra todas las sesiones. Durante la gracia no se puede cambiar el
correo ni añadir passkeys, para que nadie se quede con la cuenta mientras tanto.

Si tenías trabajos sin respuesta del proveedor, «Tu cuenta se va a borrar» dice cuántos créditos estimados suman: el
proveedor no respondió y el coste es una estimación no confirmada.

**Desaparece**: tus proyectos, personajes, productos y lugares; todos tus archivos (también del almacenamiento); tus
claves de proveedor, passkeys y sesiones; tu presupuesto, tu historial y tus apuntes de gasto; tu kit de marca y tus
ajustes; y los contadores de intentos ligados a tu correo.

**Se conserva, sin nada que te identifique**:

- el **gasto sumado** por mes, proveedor, modelo y tipo de apunte, para que las cuentas de la instalación cuadren. Sin
  tu cuenta, sin trabajos y sin notas;
- una **prueba mínima de cada consentimiento y declaración de derechos** que hiciste (de un personaje, de un lugar,
  de una canción o de una afirmación sensible del anuncio): tipo, alcance, versión del texto, casillas declaradas y
  fechas. Sin tu nombre, sin nombres de personas ni de lugares, sin fotos, sin IP y sin tu correo;
- un registro del borrado (cuándo se pidió y se hizo, el motivo si tuvo que esperar y cuántas cosas se borraron),
  sin tu cuenta ni nada que te identifique.

Esta forma de conservar lo mínimo es una decisión **provisional, pendiente de revisión jurídica**: ver
[Cumplimiento y privacidad](../legal/cumplimiento-y-privacidad.md).
