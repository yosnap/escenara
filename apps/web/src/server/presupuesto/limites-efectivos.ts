import { eq } from "drizzle-orm";
import type { Ajustes } from "../ajustes";
import { db, type Ejecutor } from "../db/cliente";
import { userPolicies } from "../db/esquema";

export type ModoLimite = "heredar" | "sin-tope" | "limite";
export function validarLimite(modo: unknown, valor: unknown): { modo: ModoLimite; valor: number | null } {
  if (modo === "heredar" || modo === "sin-tope") {
    if (valor !== null && valor !== undefined && valor !== "") throw new Error("Este modo no admite un valor.");
    return { modo, valor: null };
  }
  if (modo === "limite" && typeof valor === "number" && Number.isFinite(valor) && valor > 0) return { modo, valor };
  throw new Error("El límite debe ser un número positivo finito.");
}

export function resolverLimite(global: number, modo = "heredar", valor: number | null = null): number | null {
  const valido = validarLimite(modo, valor);
  return valido.modo === "heredar" ? (global > 0 ? global : null) : valido.modo === "sin-tope" ? null : valido.valor;
}

export async function limitesEfectivos(id: string, ajustes: Ajustes, tx: Ejecutor = db()) {
  const [politica] = await tx.select().from(userPolicies).where(eq(userPolicies.userId, id));
  return {
    autorizado: resolverLimite(ajustes.presupuestoCreditos, politica?.budgetMode, politica?.budgetValue),
    topeTrabajo: resolverLimite(ajustes.presupuestoTrabajo, politica?.jobMode, politica?.jobValue),
    origenPresupuesto: politica?.budgetMode ?? "heredar",
    origenTrabajo: politica?.jobMode ?? "heredar",
  };
}

/** Adaptación al contrato existente, sin modificar ajustes ni su caché global. */
export async function ajustesEfectivos(id: string, ajustes: Ajustes, tx: Ejecutor = db()): Promise<Ajustes> {
  const topes = await limitesEfectivos(id, ajustes, tx);
  return { ...ajustes, presupuestoCreditos: topes.autorizado ?? 0, presupuestoTrabajo: topes.topeTrabajo ?? 0 };
}
