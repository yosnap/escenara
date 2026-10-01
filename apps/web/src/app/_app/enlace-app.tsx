"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Enlace de navegación que se marca como página actual. */
export function EnlaceApp({ href, children }: { href: string; children: ReactNode }) {
  const ruta = usePathname();
  const actual = ruta === href || ruta.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={actual ? "page" : undefined}
      className="flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-texto-suave transition-colors duration-(--motion-fast) hover:text-texto aria-[current=page]:bg-acento aria-[current=page]:text-sobre-acento"
    >
      {children}
    </Link>
  );
}
