import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PaymentIntent, RiskSignals } from '../types/ai.js';
import { sanitizeText } from './promptSanitizer.js';

export interface ChatPrompt {
  system: string;
  user: string;
}

const SYSTEM_MARKER = '=====SYSTEM=====';
const USER_MARKER = '=====USER=====';

let template: ChatPrompt | undefined;

/** Loads and splits src/prompts/paymentIntent.txt once. */
function loadTemplate(): ChatPrompt {
  if (template) return template;
  const raw = readFileSync(fileURLToPath(new URL('../prompts/paymentIntent.txt', import.meta.url)), 'utf8');
  const userAt = raw.indexOf(USER_MARKER);
  if (!raw.startsWith(SYSTEM_MARKER) || userAt === -1) {
    throw new Error('paymentIntent.txt must contain the =====SYSTEM===== and =====USER===== sections');
  }
  template = {
    system: raw.slice(SYSTEM_MARKER.length, userAt).trim(),
    user: raw.slice(userAt + USER_MARKER.length).trim(),
  };
  return template;
}

/** JSON for embedding in the prompt; `<` is escaped so data can never forge or close our tags. */
const toPromptJson = (value: unknown): string => JSON.stringify(value, null, 2).replace(/</g, '\\u003c');

/**
 * Builds the system + user messages for one intent. Untrusted fields are sanitised and
 * JSON-encoded into a data block, never concatenated into the instructions.
 */
export function buildPaymentPrompt(intent: PaymentIntent, signals?: RiskSignals): ChatPrompt {
  const t = loadTemplate();
  const transaction = {
    from: intent.from,
    to: intent.to,
    amountInSmallestUnit: intent.amount,
    token: intent.token,
    context: sanitizeText(intent.context),
  };
  const onchain = {
    senderTrustScore: signals?.senderTrustScore ?? null,
    recipientTrustScore: signals?.recipientTrustScore ?? null,
  };
  // Replacer functions, not strings: the data may contain `$&`-style replacement patterns.
  const user = t.user
    .replace('{{TRANSACTION_JSON}}', () => toPromptJson(transaction))
    .replace('{{SIGNALS_JSON}}', () => toPromptJson(onchain));
  return { system: t.system, user };
}
