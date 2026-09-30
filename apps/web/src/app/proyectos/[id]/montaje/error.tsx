"use client";

/** El montaje: si falla al pintarse, la causa y cómo seguir. Lo guardado del montaje no se toca. */
// El mismo componente que la pantalla de error de la raíz: reexportarlo hace que el navegador lo descargue una sola vez
// aunque haya varios límites de error en la ruta.
export { default } from "@/app/error";
