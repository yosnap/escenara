# Producir tu proyecto, escena a escena

Cuando has aprobado el plan de un proyecto, ya se puede producir. Esta guía explica qué hace cada botón de
**Producción**, qué cuesta cada cosa y qué pasa exactamente con tu dinero cuando cancelas o cuando algo falla.

Entras desde la página del proyecto, con el botón **«Producir las escenas»**, o directamente en
`/proyectos/<id>/produccion`.

## Antes de empezar: tres cosas que hacen falta

1. **El plan aprobado.** Sin él no se produce nada. Si editaste una escena después de aprobar, su aprobación ya no
   vale y la escena lo dice: revisa el plan y vuelve a aprobarlo.
2. **Un protagonista en el proyecto.** Sus fotos son lo que da identidad a cada fotograma, así que hace falta un
   personaje con consentimiento vigente y suficientes referencias.
3. **Tu clave del proveedor** en «Tu cuenta». Se paga con tu clave, siempre.

Si falta algo, la pantalla lo enumera arriba en una **alerta de bloqueo** («Para poder producir falta esto:») con
la acción concreta. No hay botón que se pueda pulsar «a ver si suena»: lo que no se puede hacer aparece
deshabilitado y con su motivo. En la confirmación del gasto, la alerta de debajo de las casillas dice cuáles faltan
(el derecho de uso, la revisión de las fotos del personaje, la marca o el aviso de gasto alto) y, al pulsar una, te
lleva a esa casilla y la señala con una flecha.

## Cómo se produce una escena

Cada escena son **dos gastos, y cada uno lo confirmas tú**:

1. **El fotograma.** Es la imagen clave de la escena. Se encola y un proceso del servidor la envía al proveedor.
   Puedes cerrar el navegador: el trabajo sigue en la cola del servidor.
2. **El clip.** Cuando el fotograma está listo, lo miras. Si te vale, pulsas **«Aprobar y animar»** y entonces
   —y solo entonces— se encola el clip. **Un fotograma nunca se anima solo:** animar cuesta otro dinero y
   nadie lo autoriza en tu nombre.

Con el botón grande de arriba produces **todas las escenas pendientes de una vez**. Se encolan tantas como permita
el tope de esta instalación (2 por defecto); el resto espera y vuelves a pulsar cuando quede sitio. Nada se pierde.

## Por dónde va cada trabajo

En cada escena verás **cinco etapas**, y ninguna es una invención:

| Etapa | Qué significa de verdad |
|---|---|
| Preparando el envío | Un proceso del servidor ha tomado el trabajo y está resolviendo modelo, clave y fotos. |
| En cola en el proveedor | La tarea existe ya en el proveedor: tiene su identificador. |
| Generando | El proveedor informa de que está generando. |
| Guardando en tu biblioteca | Ha terminado y se está trayendo el archivo. |
| Listo | El archivo está guardado. |

**No verás ningún porcentaje ni ningún «faltan 30 segundos».** No los ponemos porque no los sabemos: el proveedor
no los da, y una barra que avanza sola es una barra que miente. Lo que sí verás es el tiempo transcurrido (que es
un dato medido), el puesto real en la cola y el estado que informa el proveedor con sus palabras.

## Zonas seguras: qué tapará la aplicación

Debajo del fotograma y del clip puedes activar **TikTok**, **Reels** o **Shorts**. Se dibujan encima las franjas
que la interfaz de cada aplicación ocupa: arriba su barra, abajo el nombre y la descripción, a la derecha los
botones. Sirve para colocar la cara y el texto donde se van a ver.

Son **aproximaciones comprobadas el 27/09/2026**, no una garantía: cada aplicación cambia su interfaz cuando
quiere.

## Cancelar: qué se puede parar y qué no

Esto es importante y preferimos decirlo claro:

- **Lo que todavía no ha salido** (en cola, o esperando tu límite de gasto) **se cancela de verdad** y se suelta su
  reserva. No ha costado nada.
- **Lo que ya está en el proveedor no se cancela.** Se marca **«se cobrará»**, sigue hasta el final y su reserva no
  se libera. El proveedor **no admite cancelar una tarea en marcha** (lo comprobamos en su documentación: no existe
  ninguna forma de pedirlo), así que prometerte lo contrario sería mentirte.

Antes de confirmar, el diálogo te dice cuántos trabajos entran en cada caso. Después te lo vuelve a decir con lo
que ha pasado.

Cancelar una escena **no toca a las demás**.

## Si algo falla

Cuando el proveedor no puede completar una generación, la escena lo dice con el motivo y **ahí se para**.

**Escenara no reintenta nunca por su cuenta algo que pudo cobrarse.** Un fallo después de hablar con el proveedor
puede haberse pagado (algunos modelos cobran el intento), y reintentarlo pagaría otra vez. En un proyecto de diez
escenas, un reintento automático sería la forma más rápida de una factura que nadie pidió.

Si quieres volver a intentarlo:

1. Pulsa **«Autorizar reintentos»** y di cuántos autorizas para **esa escena**.
2. Pulsa **«Regenerar la escena»**. Consume uno de los autorizados.

Sin reintentos autorizados, regenerar después de un fallo así se rechaza y te dice qué hacer. Es a propósito.

## Regenerar una escena

Si el fotograma no te gusta, o has cambiado el guion, **«Regenerar la escena»** encola otro fotograma **solo de esa
escena**. Las demás no se tocan: ni su estado, ni sus imágenes, ni sus vídeos.

Lo que había antes **no se borra**: sigue en tu biblioteca y aparece en el **historial de la escena**, con el modelo
con el que se hizo, lo que costó según el proveedor y qué cambió respecto a la versión anterior.

Si regeneras una escena que ya estaba producida, su fotograma aprobado y su clip dejan de ser los vigentes (porque
ya no corresponden a lo que se va a generar) y la escena vuelve a esperar tu aprobación.

## Qué cuesta y cuánto llevas gastado

- Arriba tienes lo **comprometido** del proyecto frente a su **presupuesto autorizado**. Comprometido incluye lo
  reservado por los trabajos en marcha y lo ya consumido, más lo que gastó el asistente de guion si lo usaste.
- En cada escena tienes su **estimación** (la que congeló el plan) y lo **consumido según el proveedor**.
- Cuando el proveedor no informa de lo que ha cobrado, se dice que la cifra es la estimación. Nunca se presenta una
  estimación como si fuera un gasto medido.

El importe final lo decide siempre el proveedor. Escenara estima con el precio que tiene registrado y con su fecha,
y te la muestra.

## Duración y formato

Esta versión produce **clips de 8, 6, 5 o 4 s, en 9:16 a 720p**. La duración se elige **una vez para todo el
proyecto**, en el paso «La idea», y todas sus escenas se producen con ella: verlo cada escena por separado no
tendría sentido en un vídeo que se monta seguido.

**Ocho segundos es lo de fábrica, y elegir cuatro no ahorra nada**: medido con dinero real el 27 de septiembre de
2026, el proveedor cobra **lo mismo** por un clip de 4 s que por uno de 8 s. De las cuatro duraciones, solo 8 y 4 s
tienen coste medido en esta instalación. Si el modelo predeterminado del catálogo no admite la duración de tu proyecto, la
producción se bloquea y lo dice, en lugar de encolar un clip que duraría otra cosa.

Los formatos 16:9 y 1:1 y los proyectos largos llegan más adelante.

## Qué no hace todavía esta versión

- **No pone la voz, los subtítulos ni el montaje por sí sola.** La producción termina en clips sueltos en tu biblioteca:
  la voz y los subtítulos se piden en [Voz y subtítulos](voz-y-subtitulos.md), la continuidad entre escenas se
  revisa en [Revisar la continuidad](revisar-la-continuidad.md), y el vídeo final se monta y exporta en
  [Montaje y exportación](montaje-y-exportacion.md).

## Si te pierdes

- La página del proyecto (`/proyectos/<id>`) tiene el guion, el plan y su coste, con la miniatura real de cada
  escena ya producida.
- **«Historial de trabajos»** tiene todos tus trabajos, con su estado y su coste.
- Si una escena no se deja producir, mira su aviso: siempre dice el motivo y la siguiente acción. La guía
  [«Por qué no puedo generar»](por-que-no-puedo-generar.md) explica cada uno.
