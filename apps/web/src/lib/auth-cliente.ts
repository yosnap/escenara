"use client";

import { passkeyClient } from "@better-auth/passkey/client";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { Auth } from "@/server/auth/auth";

/** Cliente de Better Auth para el navegador (mismo origen: /api/auth). */
export const authCliente = createAuthClient({
  plugins: [inferAdditionalFields<Auth>(), passkeyClient()],
});
