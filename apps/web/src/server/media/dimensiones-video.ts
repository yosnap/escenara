/**
 * Ancho y alto de un vídeo MP4/MOV leídos de su cabecera (caja `tkhd` de la pista de vídeo), sin
 * decodificarlo. Los vídeos que genera el servidor (p. ej. los clips de KIE) no pasan por el navegador,
 * que es quien mide los que sube el usuario: sin esto se guardaban sin proporción y el visor no podía
 * reservar su hueco. Devuelve las medidas de visualización (un vídeo de móvil girado 90° intercambia
 * ancho y alto) o `null` si el archivo no es ISO BMFF o no tiene pista de vídeo.
 */
export function dimensionesVideo(bytes: Uint8Array): { ancho: number; alto: number } | null {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const moov = buscarCaja(vista, 0, bytes.byteLength, "moov");
  if (!moov) return null;
  for (const trak of cajas(vista, moov.inicio, moov.fin, "trak")) {
    const tkhd = buscarCaja(vista, trak.inicio, trak.fin, "tkhd");
    if (!tkhd || tkhd.fin - tkhd.inicio < 84) continue;
    // Tras la matriz de transformación (36 bytes) van ancho y alto en coma fija 16.16.
    const ancho = Math.round(vista.getUint32(tkhd.fin - 8) / 65536);
    const alto = Math.round(vista.getUint32(tkhd.fin - 4) / 65536);
    if (ancho <= 0 || alto <= 0) continue; // pista de audio
    const matriz = tkhd.fin - 44;
    const girado = vista.getInt32(matriz) === 0 && vista.getInt32(matriz + 16) === 0;
    return girado ? { ancho: alto, alto: ancho } : { ancho, alto };
  }
  return null;
}

interface Caja {
  inicio: number;
  fin: number;
}

function* cajas(vista: DataView, desde: number, hasta: number, tipo: string): Generator<Caja> {
  let pos = desde;
  while (pos + 8 <= hasta) {
    let tamano = vista.getUint32(pos);
    let cabecera = 8;
    if (tamano === 1) {
      if (pos + 16 > hasta) return;
      tamano = Number(vista.getBigUint64(pos + 8));
      cabecera = 16;
    } else if (tamano === 0) {
      tamano = hasta - pos;
    }
    if (tamano < cabecera || pos + tamano > hasta) return;
    const nombre = String.fromCharCode(
      vista.getUint8(pos + 4),
      vista.getUint8(pos + 5),
      vista.getUint8(pos + 6),
      vista.getUint8(pos + 7),
    );
    if (nombre === tipo) yield { inicio: pos + cabecera, fin: pos + tamano };
    pos += tamano;
  }
}

function buscarCaja(vista: DataView, desde: number, hasta: number, tipo: string): Caja | null {
  for (const caja of cajas(vista, desde, hasta, tipo)) return caja;
  return null;
}
