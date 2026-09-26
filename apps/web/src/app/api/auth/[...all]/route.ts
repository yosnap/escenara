import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth/auth";

export const dynamic = "force-dynamic";

/** Todas las rutas de Better Auth: /api/auth/sign-in/email, /api/auth/sign-up/email, /api/auth/passkey/… */
export const GET = (peticion: Request) => toNextJsHandler(auth()).GET(peticion);
export const POST = (peticion: Request) => toNextJsHandler(auth()).POST(peticion);
