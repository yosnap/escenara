# Cómo guardamos tus claves de API

**Versión:** 0.56.4 · **Para:** quien usa Escenara con sus propias claves y quiere saber qué pasa con ellas

Para generar, Escenara usa **tu** clave de KIE, Google, ElevenLabs o del servicio compatible que configures, y el
proveedor te cobra a ti. Es normal preguntarse qué hacemos con esa clave. Esta guía lo explica sin letra pequeña:
qué protecciones tiene, qué no podemos prometer y qué puedes hacer tú para quedarte tranquilo.

## En pocas palabras

- Tu clave se guarda **cifrada**. En la base de datos no hay ninguna clave legible.
- Después de guardarla **no se vuelve a mostrar** a nadie, ni a ti ni a quien administra. Solo se ven sus 4 últimos
  caracteres, para que sepas cuál es.
- Solo se usa para **los trabajos que tú pides**, en el momento de enviarlos al proveedor.
- Puedes **quitarla cuando quieras**, y desaparece también si borras tu cuenta.

## Cómo se protege

**Cifrada antes de guardarse.** Al pulsar «Guardar», la clave se cifra con AES-256-GCM, el estándar que usan bancos y
gestores de contraseñas. La llave que la descifra no está en la base de datos, sino aparte, en la configuración del
servidor. Si alguien consiguiera una copia de la base de datos, solo vería texto cifrado inservible.

**Atada a tu cuenta.** Cada clave cifrada va ligada a tu usuario y a su proveedor. Copiarla a otra cuenta no sirve de
nada, porque ya no se puede descifrar. Nadie puede usar, probar, cambiar ni borrar tu clave desde otra cuenta.

**Comprobada antes de guardarse.** Escenara prueba la clave con el proveedor y solo la guarda si funciona. Si
sustituyes una clave por otra que no vale, la anterior sigue en su sitio.

**Fuera de registros y copias de texto.** Los registros de auditoría y los mensajes de error nunca incluyen claves.
Tampoco aparecen en la documentación, en la comunidad ni en las exportaciones de tus proyectos.

**Solo viaja al proveedor.** Cuando confirmas una generación, el servidor descifra la clave en ese momento y la envía
al proveedor correspondiente, por una conexión cifrada, para lanzar tu trabajo. No se envía a ningún otro sitio.

## Lo que no podemos prometer

Para lanzar tus generaciones, el servidor tiene que poder descifrar tu clave en el momento de usarla. Por tanto, quien
administra el servidor podría técnicamente llegar a ella. Pasa lo mismo en cualquier servicio que trabaje con claves
de sus usuarios. Lo que sí garantizamos es que está cifrada, que no se muestra a nadie y que solo se usa para lo que
tú pides.

Escenara no tiene, de momento, auditorías externas ni certificaciones de seguridad como ISO 27001 o SOC 2.

## Cómo quedarte tranquilo

- **Crea una clave solo para Escenara.** No reutilices la que usas en otras herramientas: así sabes exactamente
  qué hace cada una.
- **Ponle un límite de gasto**, si tu proveedor lo permite, o mantén en esa cuenta solo el saldo que quieras gastar.
- **Revísala de vez en cuando.** El historial de tu cuenta muestra cada generación y lo que costó. Compáralo con el
  consumo que te muestra el proveedor.
- **Si dejas de confiar, revócala en el proveedor.** Deja de funcionar al momento, en Escenara y en cualquier otro
  sitio, sin depender de nosotros. Después puedes quitarla también en **Cuenta → Credenciales de IA**.

## Tus datos y la ley

Una clave de API no es, en sí misma, un dato personal, pero la tratamos con las garantías del Reglamento General de
Protección de Datos: cifrado, acceso mínimo, uso solo para la finalidad que pides y borrado cuando lo solicitas. La
política de privacidad de la instalación, enlazada al pie de cada página de Escenara, lo recoge. Para saber qué se
borra al eliminar tu cuenta, consulta [Tus datos: historial, exportación y borrado](tus-datos.md).

Para conseguir y probar cada clave, consulta [Configurar la API de cada proveedor](configurar-la-api-de-cada-proveedor.md).
