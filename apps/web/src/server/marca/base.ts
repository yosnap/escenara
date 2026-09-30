import { type DocumentoMarca, validarDocumentoMarca } from "@/lib/marca-esquema";
import referencia from "../../../../../docs/branding/escenara.brand.json";

/**
 * La marca de referencia de Escenara (`docs/branding/escenara.brand.json`), validada con el mismo esquema que las
 * marcas de la instalación. Es de la que nace el primer borrador y la que se usa mientras no haya ninguna publicada.
 * Si algún día el JSON de referencia no pasara el esquema, falla aquí y en los tests, no en la cara de nadie.
 */
let cache: DocumentoMarca | undefined;

export function documentoBase(): DocumentoMarca {
  if (cache) return cache;
  const resultado = validarDocumentoMarca(referencia);
  if (!resultado.ok) {
    throw new Error(
      `La marca de referencia no cumple su esquema: ${resultado.errores.map((e) => `${e.campo}: ${e.mensaje}`).join("; ")}`,
    );
  }
  cache = resultado.documento;
  return cache;
}
