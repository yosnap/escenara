import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth/auth";

export const dynamic = "force-dynamic";

/** Todas las rutas de Better Auth: /api/auth/sign-in/email, /api/auth/sign-up/email, /api/auth/passkey/… */
export const GET = async (peticion: Request) => toNextJsHandler(await auth()).GET(peticion);
export const POST = async (peticion: Request) => toNextJsHandler(await auth()).POST(peticion);
