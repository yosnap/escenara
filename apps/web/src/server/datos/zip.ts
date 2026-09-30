/**
 * Escritor mínimo de ZIP, sin dependencias. Guarda cada archivo **sin comprimir** (método 0): fotos, clips y audio
 * ya vienen comprimidos y volver a comprimirlos solo gasta CPU del worker; el JSON y el texto son pequeños.
 *
 * Escribe al vuelo en un destino (un fichero temporal), así que en memoria solo está el archivo que se añade en ese
 * momento. Sin extensiones ZIP64: el total y cada archivo tienen que caber en 4 GiB y como mucho 65 535 entradas; el
 * tamaño máximo de la exportación (Admin › Ajustes) queda siempre por debajo.
 */

const LIMITE_32 = 0xffff_ffff;
const MAXIMO_ENTRADAS = 0xffff;
/** Bit 11: el nombre va en UTF-8 (tildes y eñes sin sorpresas al descomprimir). */
const BANDERA_UTF8 = 0x0800;

export class ErrorZip extends Error {}

interface Central {
  nombre: Uint8Array;
  crc: number;
  tamano: number;
  desplazamiento: number;
  hora: number;
  dia: number;
}

/** Fecha y hora en el formato de MS-DOS que usa el ZIP (precisión de dos segundos, desde 1980). */
function fechaDos(fecha: Date): { hora: number; dia: number } {
  const anio = Math.max(1980, fecha.getFullYear());
  return {
    hora: (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | Math.floor(fecha.getSeconds() / 2),
    dia: ((anio - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate(),
  };
}

/** Nombre seguro dentro del paquete: relativo, con `/`, sin `..` ni caracteres de control. */
export function esNombreSeguro(nombre: string): boolean {
  return (
    nombre.length > 0 &&
    nombre.length <= 240 &&
    !nombre.startsWith("/") &&
    !nombre.includes("\\") &&
    !nombre.split("/").some((parte) => parte === "" || parte === "." || parte === "..") &&
    // biome-ignore lint/suspicious/noControlCharactersInRegex: se rechazan justo los caracteres de control.
    !/[\u0000-\u001f\u007f]/.test(nombre)
  );
}

export interface DestinoZip {
  write(datos: Uint8Array): number | Promise<number>;
}

export class EscritorZip {
  private readonly centrales: Central[] = [];
  private desplazamiento = 0;
  private cerrado = false;
  private readonly nombres = new Set<string>();

  constructor(
    private readonly destino: DestinoZip,
    private readonly fecha = new Date(),
  ) {}

  /** Bytes escritos hasta ahora: sirve para cortar a tiempo si el paquete se pasa del tamaño máximo. */
  get tamano(): number {
    return this.desplazamiento;
  }

  private async escribir(datos: Uint8Array): Promise<void> {
    await this.destino.write(datos);
    this.desplazamiento += datos.byteLength;
  }

  async agregar(nombre: string, datos: Uint8Array): Promise<void> {
    if (this.cerrado) throw new ErrorZip("El paquete ya está cerrado.");
    if (!esNombreSeguro(nombre)) throw new ErrorZip(`Nombre de archivo no válido dentro del paquete: ${nombre}`);
    if (this.nombres.has(nombre)) throw new ErrorZip(`Archivo repetido dentro del paquete: ${nombre}`);
    if (this.centrales.length >= MAXIMO_ENTRADAS) throw new ErrorZip("El paquete tiene demasiados archivos.");
    const bytesNombre = new TextEncoder().encode(nombre);
    if (datos.byteLength > LIMITE_32 || this.desplazamiento + datos.byteLength + 30 + bytesNombre.length > LIMITE_32) {
      throw new ErrorZip("El paquete pasaría de 4 GiB.");
    }
    this.nombres.add(nombre);
    const crc = Bun.hash.crc32(datos) >>> 0;
    const { hora, dia } = fechaDos(this.fecha);
    const cabecera = new DataView(new ArrayBuffer(30));
    cabecera.setUint32(0, 0x04034b50, true);
    cabecera.setUint16(4, 20, true); // versión necesaria: 2.0
    cabecera.setUint16(6, BANDERA_UTF8, true);
    cabecera.setUint16(8, 0, true); // método: almacenado
    cabecera.setUint16(10, hora, true);
    cabecera.setUint16(12, dia, true);
    cabecera.setUint32(14, crc, true);
    cabecera.setUint32(18, datos.byteLength, true);
    cabecera.setUint32(22, datos.byteLength, true);
    cabecera.setUint16(26, bytesNombre.length, true);
    cabecera.setUint16(28, 0, true);
    this.centrales.push({
      nombre: bytesNombre,
      crc,
      tamano: datos.byteLength,
      desplazamiento: this.desplazamiento,
      hora,
      dia,
    });
    await this.escribir(new Uint8Array(cabecera.buffer));
    await this.escribir(bytesNombre);
    await this.escribir(datos);
  }

  /** Escribe el directorio central y devuelve el tamaño total del paquete. */
  async cerrar(): Promise<number> {
    if (this.cerrado) return this.desplazamiento;
    this.cerrado = true;
    const inicio = this.desplazamiento;
    for (const c of this.centrales) {
      const v = new DataView(new ArrayBuffer(46));
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(4, 0x0314, true); // hecho por: Unix, 2.0
      v.setUint16(6, 20, true);
      v.setUint16(8, BANDERA_UTF8, true);
      v.setUint16(10, 0, true);
      v.setUint16(12, c.hora, true);
      v.setUint16(14, c.dia, true);
      v.setUint32(16, c.crc, true);
      v.setUint32(20, c.tamano, true);
      v.setUint32(24, c.tamano, true);
      v.setUint16(28, c.nombre.length, true);
      // Extra, comentario, disco y atributos internos a cero; externos: fichero normal 0644.
      v.setUint32(38, (0o100644 << 16) >>> 0, true);
      v.setUint32(42, c.desplazamiento, true);
      await this.escribir(new Uint8Array(v.buffer));
      await this.escribir(c.nombre);
    }
    const tamanoCentral = this.desplazamiento - inicio;
    if (this.desplazamiento + 22 > LIMITE_32) throw new ErrorZip("El paquete pasaría de 4 GiB.");
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, this.centrales.length, true);
    fin.setUint16(10, this.centrales.length, true);
    fin.setUint32(12, tamanoCentral, true);
    fin.setUint32(16, inicio, true);
    await this.escribir(new Uint8Array(fin.buffer));
    return this.desplazamiento;
  }
}

/**
 * Lee un ZIP escrito sin comprimir (el de {@link EscritorZip}) a partir de su directorio central. Lo usan los tests
 * para comprobar el contenido de un paquete de verdad; no descomprime otros métodos.
 */
export function leerZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fin = -1;
  for (let i = bytes.byteLength - 22; i >= 0; i--) {
    if (vista.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new ErrorZip("No es un ZIP: falta el directorio central.");
  const entradas = vista.getUint16(fin + 10, true);
  let p = vista.getUint32(fin + 16, true);
  const archivos = new Map<string, Uint8Array>();
  const decodificador = new TextDecoder();
  for (let n = 0; n < entradas; n++) {
    if (vista.getUint32(p, true) !== 0x02014b50) throw new ErrorZip("Directorio central dañado.");
    if (vista.getUint16(p + 10, true) !== 0) throw new ErrorZip("Solo se leen archivos sin comprimir.");
    const crc = vista.getUint32(p + 16, true);
    const tamano = vista.getUint32(p + 20, true);
    const largoNombre = vista.getUint16(p + 28, true);
    const largoExtra = vista.getUint16(p + 30, true);
    const largoComentario = vista.getUint16(p + 32, true);
    const local = vista.getUint32(p + 42, true);
    const nombre = decodificador.decode(bytes.subarray(p + 46, p + 46 + largoNombre));
    const inicioDatos = local + 30 + vista.getUint16(local + 26, true) + vista.getUint16(local + 28, true);
    const datos = bytes.subarray(inicioDatos, inicioDatos + tamano);
    if (Bun.hash.crc32(datos) >>> 0 !== crc) throw new ErrorZip(`CRC incorrecto en ${nombre}.`);
    archivos.set(nombre, datos);
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return archivos;
}
