/**
 * Sube un vídeo de tutorial a YouTube con la API de datos v3.
 *
 * Uso:
 *   bun scripts/youtube/subir-video.ts --autorizar
 *   bun scripts/youtube/subir-video.ts --video <mp4> --titulo "…" --descripcion-fichero <txt>
 *     [--etiquetas a,b,c] [--lista "Tutoriales de Escenara"] [--subtitulos <srt>]
 *     [--privacidad public|unlisted|private] [--confirmar]
 *
 * Sin `--confirmar` solo enseña lo que haría: subir a YouTube es publicar y lo decide el propietario.
 * Las credenciales viven en docs/privado/youtube/ (fuera de git): `client_secret.json` (cliente OAuth
 * de escritorio) y `token.json` (refresco, se crea con `--autorizar`). Nunca se imprimen.
 * Un token autorizado antes de pedir `youtube.force-ssl` no puede subir subtítulos: repite `--autorizar`.
 */
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const CARPETA = join(import.meta.dir, "../../docs/privado/youtube");
const CLIENTE = join(CARPETA, "client_secret.json");
const TOKEN = join(CARPETA, "token.json");
/** Puerto fijo para la vuelta de la autorización (ver puertos del proyecto). */
const PUERTO = 8521;
const REDIRECCION = `http://localhost:${PUERTO}`;
/** `youtube.force-ssl` es el que exige `captions.insert`; los demás cubren la subida y las listas. */
const PERMISOS = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.force-ssl",
].join(" ");
/** Categoría «Formación» de YouTube. */
const CATEGORIA_FORMACION = "27";

type Cliente = { client_id: string; client_secret: string; auth_uri: string; token_uri: string };

const { values: args } = parseArgs({
  options: {
    autorizar: { type: "boolean", default: false },
    video: { type: "string" },
    titulo: { type: "string" },
    "descripcion-fichero": { type: "string" },
    etiquetas: { type: "string", default: "" },
    lista: { type: "string" },
    subtitulos: { type: "string" },
    privacidad: { type: "string", default: "public" },
    confirmar: { type: "boolean", default: false },
  },
});

const cliente = (): Cliente => {
  if (!existsSync(CLIENTE))
    throw new Error(`Falta ${CLIENTE}: descarga el cliente OAuth de escritorio de Google Cloud.`);
  return JSON.parse(readFileSync(CLIENTE, "utf8")).installed as Cliente;
};

const guardarToken = (datos: unknown) => {
  writeFileSync(TOKEN, JSON.stringify(datos, null, 2), { mode: 0o600 });
  chmodSync(TOKEN, 0o600);
};

async function pedirToken(cuerpo: Record<string, string>) {
  const c = cliente();
  const r = await fetch(c.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, ...cuerpo }),
  });
  const datos = (await r.json()) as Record<string, string>;
  if (!r.ok) throw new Error(`Google rechazó el token (${r.status}): ${datos.error_description ?? datos.error}`);
  return datos;
}

async function autorizar() {
  const c = cliente();
  const estado = crypto.randomUUID();
  const url = `${c.auth_uri}?${new URLSearchParams({
    client_id: c.client_id,
    redirect_uri: REDIRECCION,
    response_type: "code",
    scope: PERMISOS,
    access_type: "offline",
    prompt: "consent",
    state: estado,
  })}`;
  const codigo = await new Promise<string>((resolver, rechazar) => {
    const servidor = Bun.serve({
      port: PUERTO,
      hostname: "localhost",
      fetch(peticion) {
        const p = new URL(peticion.url).searchParams;
        if (p.get("state") !== estado) return new Response("Estado no válido.", { status: 400 });
        setTimeout(() => servidor.stop(), 100);
        const valor = p.get("code");
        if (!valor) {
          rechazar(new Error(`Autorización cancelada: ${p.get("error") ?? "sin código"}`));
          return new Response("Autorización cancelada. Puedes cerrar esta pestaña.");
        }
        resolver(valor);
        return new Response("Escenara ya puede subir vídeos a tu canal. Puedes cerrar esta pestaña.");
      },
    });
    console.log("Se abre el navegador para autorizar el acceso a tu canal de YouTube…");
    Bun.spawn(["open", url]);
  });
  const datos = await pedirToken({ code: codigo, grant_type: "authorization_code", redirect_uri: REDIRECCION });
  if (!datos.refresh_token) throw new Error("Google no devolvió token de refresco; vuelve a autorizar.");
  guardarToken({ refresh_token: datos.refresh_token });
  console.log(`Autorizado. Token guardado en ${TOKEN} (permisos 600).`);
}

async function accesoVigente(): Promise<string> {
  if (!existsSync(TOKEN)) throw new Error("No hay autorización: ejecuta antes con --autorizar.");
  const { refresh_token } = JSON.parse(readFileSync(TOKEN, "utf8"));
  return (await pedirToken({ refresh_token, grant_type: "refresh_token" })).access_token;
}

async function api(acceso: string, ruta: string, init: RequestInit = {}) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${ruta}`, {
    ...init,
    headers: { authorization: `Bearer ${acceso}`, "content-type": "application/json", ...init.headers },
  });
  const datos = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(`YouTube respondió ${r.status} en ${ruta}: ${JSON.stringify(datos).slice(0, 300)}`);
  return datos;
}

async function subirFichero(acceso: string, url: string, ruta: string, tipo: string, metadatos: unknown) {
  const inicio = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${acceso}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": tipo,
      "x-upload-content-length": String(statSync(ruta).size),
    },
    body: JSON.stringify(metadatos),
  });
  const destino = inicio.headers.get("location");
  if (!inicio.ok || !destino)
    throw new Error(`No se pudo iniciar la subida (${inicio.status}): ${await inicio.text()}`);
  const r = await fetch(destino, { method: "PUT", headers: { "content-type": tipo }, body: Bun.file(ruta) });
  if (!r.ok) throw new Error(`La subida falló (${r.status}): ${await r.text()}`);
  return (await r.json()) as { id: string };
}

async function listaPorTitulo(acceso: string, titulo: string, privacidad: string): Promise<string> {
  const listas = (await api(acceso, "playlists?part=snippet&mine=true&maxResults=50")) as {
    items?: { id: string; snippet: { title: string } }[];
  };
  const existente = listas.items?.find((l) => l.snippet.title === titulo);
  if (existente) return existente.id;
  const nueva = (await api(acceso, "playlists?part=snippet,status", {
    method: "POST",
    body: JSON.stringify({ snippet: { title: titulo }, status: { privacyStatus: privacidad } }),
  })) as { id: string };
  return nueva.id;
}

async function subir() {
  const { video, titulo, lista, subtitulos, privacidad } = args;
  const descripcionFichero = args["descripcion-fichero"];
  if (!video || !titulo || !descripcionFichero) throw new Error("Faltan --video, --titulo o --descripcion-fichero.");
  if (!["public", "unlisted", "private"].includes(privacidad ?? "")) throw new Error("Privacidad no válida.");
  for (const f of [video, descripcionFichero, subtitulos].filter(Boolean) as string[]) {
    if (!existsSync(f)) throw new Error(`No existe ${f}`);
  }
  const metadatos = {
    snippet: {
      title: titulo,
      description: readFileSync(descripcionFichero, "utf8"),
      tags: args.etiquetas ? args.etiquetas.split(",").map((e) => e.trim()) : [],
      categoryId: CATEGORIA_FORMACION,
      defaultLanguage: "es",
      defaultAudioLanguage: "es",
    },
    // Se sube privado y solo al final pasa a la privacidad pedida: si fallan subtítulos o lista, no queda público a medias.
    status: { privacyStatus: "private", selfDeclaredMadeForKids: false },
  };
  const tamano = (statSync(video).size / 1024 / 1024).toFixed(1);
  console.log(`Vídeo: ${video} (${tamano} MB)\nTítulo: ${titulo}\nPrivacidad: ${privacidad}`);
  console.log(`Lista: ${lista ?? "ninguna"}\nSubtítulos: ${subtitulos ?? "ninguno"}`);
  if (!args.confirmar) {
    console.log("\nPrueba en seco: no se ha subido nada. Repite con --confirmar para publicar.");
    return;
  }
  const acceso = await accesoVigente();
  const subido = await subirFichero(
    acceso,
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    video,
    "video/mp4",
    metadatos,
  );
  console.log(`Subido: https://youtu.be/${subido.id}`);
  if (subtitulos) {
    await subirFichero(
      acceso,
      "https://www.googleapis.com/upload/youtube/v3/captions?uploadType=resumable&part=snippet",
      subtitulos,
      "application/octet-stream",
      { snippet: { videoId: subido.id, language: "es", name: "Español" } },
    );
    console.log("Subtítulos en español añadidos.");
  }
  if (lista) {
    const listaId = await listaPorTitulo(acceso, lista, privacidad ?? "public");
    await api(acceso, "playlistItems?part=snippet", {
      method: "POST",
      body: JSON.stringify({
        snippet: { playlistId: listaId, resourceId: { kind: "youtube#video", videoId: subido.id } },
      }),
    });
    console.log(`Añadido a la lista «${lista}»: https://www.youtube.com/playlist?list=${listaId}`);
  }
  if (privacidad !== "private") {
    await api(acceso, "videos?part=status", {
      method: "PUT",
      body: JSON.stringify({ id: subido.id, status: { privacyStatus: privacidad, selfDeclaredMadeForKids: false } }),
    });
    console.log(`Privacidad cambiada a «${privacidad}».`);
  }
}

await (args.autorizar ? autorizar() : subir()).catch((e: Error) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
