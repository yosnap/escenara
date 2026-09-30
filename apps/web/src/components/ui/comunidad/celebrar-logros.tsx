"use client";

import { useEffect, useRef, useState } from "react";
import { useConfeti } from "../motion";
import { marcarLogrosCelebrados } from "./api-comunidad";

/**
 * Celebra los logros recién conseguidos **una vez**: confeti de chispas (que no sale con «reducir movimiento»: lo
 * decide `useConfeti`) y un aviso para lectores de pantalla; luego los marca como celebrados. Solo se pinta en la
 * comunidad, nunca en una pantalla de coste o de consentimiento.
 */
export function CelebrarLogros({ porCelebrar }: { porCelebrar: { clave: string; titulo: string }[] }) {
  const { lanzar, confeti } = useConfeti();
  const [anuncio, setAnuncio] = useState("");
  const hecho = useRef(false);
  useEffect(() => {
    if (hecho.current || porCelebrar.length === 0) return;
    hecho.current = true;
    lanzar();
    setAnuncio(`Logro conseguido: ${porCelebrar.map((l) => l.titulo).join(", ")}.`);
    void marcarLogrosCelebrados(porCelebrar.map((l) => l.clave));
  }, [porCelebrar, lanzar]);
  return (
    <>
      {confeti}
      <p role="status" className="sr-only">
        {anuncio}
      </p>
    </>
  );
}
