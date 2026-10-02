export interface DatosPlantillaCorreo {
  nombre: string;
  titulo: string;
  texto: string;
  boton: string;
  url: string;
  nota: string;
}

const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** HTML independiente del proveedor, sin recursos remotos; tablas e inline styles para clientes de correo. */
export function plantillaEnlace(datos: DatosPlantillaCorreo): { texto: string; html: string } {
  const enlace = new URL(datos.url);
  if (!["https:", "http:"].includes(enlace.protocol)) throw new Error("El enlace del correo debe usar HTTP o HTTPS.");
  const { nombre, titulo, texto, boton, url, nota } = datos;
  return {
    texto: `Hola, ${nombre}:\n\n${titulo}\n\n${texto}\n\n${boton}: ${url}\n\n${nota}\n\n— Escenara`,
    html: `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapar(titulo)}</title>
<style>@media(max-width:420px){.correo-marco{padding:20px 10px!important}.correo-cabecera{padding:24px 20px!important}.correo-cuerpo{padding:28px 20px!important}h1{font-size:26px!important}}</style></head>
<body style="margin:0;padding:0;background:#f1f4fa;color:#182032;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapar(texto)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f4fa"><tr><td class="correo-marco" align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border:1px solid #dce2ee;border-radius:20px;overflow:hidden">
<tr><td class="correo-cabecera" style="padding:28px 32px;background:#101b35;border-radius:20px 20px 0 0">
<p style="margin:0;color:#ffffff;font-size:22px;letter-spacing:3px;font-weight:700">ESCENARA<span style="color:#92b2ff">.</span></p>
<p style="margin:8px 0 0;color:#bac8e5;font-size:12px;letter-spacing:1px">TU ESTUDIO CREATIVO</p></td></tr>
<tr><td class="correo-cuerpo" style="padding:36px 32px">
<p style="margin:0 0 16px;color:#2753d7;font-size:11px;letter-spacing:2px;font-weight:700">CUENTA Y SEGURIDAD</p>
<h1 style="margin:0 0 24px;font-size:30px;line-height:1.2;font-weight:700;color:#182032">${escapar(titulo)}</h1>
<p style="margin:0 0 12px;font-size:16px;line-height:1.6">Hola, ${escapar(nombre)}:</p>
<p style="margin:0 0 28px;font-size:16px;line-height:1.7;color:#485269">${escapar(texto)}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#2753d7" style="border-radius:10px;text-align:center">
<a href="${escapar(url)}" style="display:inline-block;padding:15px 24px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;line-height:1.5">${escapar(boton)}</a>
</td></tr></table>
<p style="margin:24px 0 6px;font-size:12px;line-height:1.6;color:#69758e">Si el botón no funciona, copia esta dirección en tu navegador:</p>
<p style="margin:0;font-size:12px;line-height:1.6;word-break:break-all;overflow-wrap:anywhere"><a href="${escapar(url)}" style="color:#2753d7;text-decoration:underline">${escapar(url)}</a></p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;border-top:1px solid #e2e7f0"><tr><td style="padding-top:22px">
<p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#182032">Protege tu cuenta</p>
<p style="margin:0;font-size:13px;line-height:1.7;color:#69758e">${escapar(nota)}</p>
</td></tr></table></td></tr></table>
<p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#69758e">Escenara · Tu imaginación, en escena.<br>Este mensaje está relacionado con la seguridad de tu cuenta.</p>
</td></tr></table></body></html>`,
  };
}

/** Muestras ficticias que usan el mismo renderizador que los envíos reales. */
export const MUESTRAS_CORREO: (DatosPlantillaCorreo & { id: string; etiqueta: string })[] = [
  {
    id: "verificacion",
    etiqueta: "Confirmación y reenvío",
    nombre: "Alex",
    titulo: "¡Te damos la bienvenida a Escenara!",
    texto: "Confirma tu correo para activar la cuenta y empezar a crear.",
    boton: "Confirmar mi correo",
    url: "https://escenara.example/verificar?token=ejemplo",
    nota: "El enlace caduca en 24 horas. Si no has creado una cuenta, ignora este correo.",
  },
  {
    id: "recuperacion",
    etiqueta: "Recuperación de contraseña",
    nombre: "Alex",
    titulo: "Restablece tu contraseña",
    texto: "Hemos recibido una solicitud para cambiar la contraseña de tu cuenta.",
    boton: "Elegir una contraseña nueva",
    url: "https://escenara.example/restablecer?token=ejemplo",
    nota: "El enlace caduca en una hora. Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.",
  },
  {
    id: "borrado",
    etiqueta: "Solicitud de borrado",
    nombre: "Alex",
    titulo: "Tu cuenta se va a borrar",
    texto:
      "Se ha pedido borrar tu cuenta. Durante el plazo de recuperación puedes entrar para cancelar el borrado, ver tu historial y descargar tus proyectos.",
    boton: "Ver o cancelar el borrado",
    url: "https://escenara.example/cuenta/borrado",
    nota: "El enlace requiere iniciar sesión. Si no has pedido el borrado, recupera el acceso y cambia tu contraseña.",
  },
  {
    id: "cancelacion",
    etiqueta: "Borrado cancelado",
    nombre: "Alex",
    titulo: "Tu cuenta sigue activa",
    texto: "Se ha cancelado el borrado de tu cuenta y vuelve a estar activa, con todos tus datos.",
    boton: "Entrar en tu cuenta",
    url: "https://escenara.example/cuenta",
    nota: "Si no lo has cancelado tú, cambia tu contraseña y cierra las demás sesiones en Tu cuenta.",
  },
  {
    id: "cancelacion-recuperacion",
    etiqueta: "Borrado cancelado al recuperar acceso",
    nombre: "Alex",
    titulo: "Tu cuenta sigue activa",
    texto:
      "Se ha cancelado el borrado de tu cuenta porque restableciste tu contraseña. Vuelve a estar activa, con todos tus datos.",
    boton: "Entrar en tu cuenta",
    url: "https://escenara.example/cuenta",
    nota: "Si no has restablecido tú la contraseña, protege tu correo y vuelve a restablecerla.",
  },
  {
    id: "prueba",
    etiqueta: "Correo de prueba",
    nombre: "Alex",
    titulo: "Tu correo está listo",
    texto:
      "El proveedor ha aceptado este correo de prueba de Escenara. Comprueba su llegada y presentación en tu bandeja.",
    boton: "Abrir administración",
    url: "https://escenara.example/admin/ajustes",
    nota: "Este envío se ha solicitado desde la administración de tu instalación.",
  },
];
