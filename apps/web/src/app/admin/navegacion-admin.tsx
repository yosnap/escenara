"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, type ReactNode, useContext, useRef } from "react";

const CerrarMenu = createContext(() => {});

export function NavegacionAdmin({ children }: { children: ReactNode }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  return (
    <>
      <aside className="hidden w-60 shrink-0 bg-superficie lg:block">{children}</aside>
      <div className="border-b border-borde p-3 lg:hidden">
        <button
          type="button"
          aria-haspopup="dialog"
          className="min-h-11 rounded-control bg-elevada px-4"
          onClick={() => dialogo.current?.showModal()}
        >
          Menú de administración
        </button>
        <dialog
          ref={dialogo}
          aria-label="Menú de administración"
          className="fixed inset-0 m-auto max-h-[90dvh] w-[min(90vw,24rem)] overflow-y-auto rounded-control bg-superficie text-texto backdrop:bg-black/50"
        >
          <button type="button" className="m-3 min-h-11 px-3" onClick={() => dialogo.current?.close()}>
            Cerrar menú
          </button>
          <CerrarMenu.Provider value={() => dialogo.current?.close()}>{children}</CerrarMenu.Provider>
        </dialog>
      </div>
    </>
  );
}

export function EnlaceAdmin({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const ruta = usePathname();
  const cerrar = useContext(CerrarMenu);
  return (
    <Link
      href={href}
      onClick={cerrar}
      className={className}
      aria-current={ruta === href || (href !== "/admin" && ruta.startsWith(`${href}/`)) ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
