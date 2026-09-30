"use client";

import dynamic from "next/dynamic";

/** El confeti (y su librería de animación) solo se descarga si hay algo que celebrar. */
const CelebrarLogros = dynamic(() => import("./celebrar-logros").then((m) => m.CelebrarLogros), { ssr: false });

export function Celebracion({ porCelebrar }: { porCelebrar: { clave: string; titulo: string }[] }) {
  return porCelebrar.length > 0 ? <CelebrarLogros porCelebrar={porCelebrar} /> : null;
}
