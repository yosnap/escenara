import { ShieldCheck } from "lucide-react";
import { Alerta } from "./alerta";

/**
 * Componentes del **reparto de dos personajes** (0.28.0), compartidos por la pantalla de la escena y la de
 * producción: la zona de claridad del consentimiento y la previsualización en castellano de lo pedido.
 *
 * Están aquí porque las dos pantallas tienen que decir **lo mismo con las mismas palabras**: la del guion, para
 * que el usuario sepa qué está montando, y la de producción, para que sepa qué va a pagar.
 */

/**
 * **A quién le falta su consentimiento y qué le falta**, en zona de claridad.
 *
 * Con dos personas reales hacen falta **dos** consentimientos registrados, y sin los dos no se genera. Decir
 * «falta un consentimiento» sin decir de quién obliga a adivinar, así que las faltas llegan ya escritas con el
 * nombre de cada uno (`lib/reparto-pantalla.ts › faltasDelReparto`).
 */
export function ZonaDeConsentimiento({
  faltas,
  /** Qué decir cuando no falta nada. Cambia entre pantallas: montando el reparto o a punto de pagarlo. */
  sinFaltas,
  /** Qué hacer para arreglarlo. Se enseña solo cuando falta algo. */
  comoArreglarlo,
}: {
  faltas: readonly string[];
  sinFaltas: string;
  comoArreglarlo: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-control border-2 border-borde bg-superficie p-3">
      <p className="flex items-center gap-2 font-semibold text-texto">
        <ShieldCheck className="size-4 text-acento" aria-hidden />
        Consentimiento de quien sale
      </p>
      {faltas.length === 0 ? (
        <p className="text-sm text-texto-suave">{sinFaltas}</p>
      ) : (
        <Alerta tipo="bloqueo" compacta anuncio="ninguno" protege elementos={faltas.map((texto) => ({ texto }))}>
          {comoArreglarlo}
        </Alerta>
      )}
    </div>
  );
}

/**
 * **Lo que se ha pedido**, contado en castellano: quién está a cada lado, quién habla y qué hace el otro.
 *
 * Nunca enseña el prompt (ADR-0022): lo que se lee aquí son frases escritas a partir del reparto guardado, para
 * que se pueda comprobar lo que se va a pedir antes de pagarlo.
 */
export function ResumenDeLoPedido({ frases, nota }: { frases: readonly string[]; nota?: string }) {
  if (frases.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 rounded-control bg-superficie p-3">
      <p className="font-semibold text-texto">Lo que se ha pedido</p>
      <ul className="flex flex-col gap-1 text-sm text-texto">
        {frases.map((frase) => (
          <li key={frase}>{frase}</li>
        ))}
      </ul>
      {nota && <p className="text-sm text-texto-suave">{nota}</p>}
    </div>
  );
}
