/**
 * Works out who a transaction is paying. Only reads the unsigned payload: nothing is sent anywhere.
 *
 * - Native transfer: the recipient is `to`.
 * - ERC-20 transfer / transferFrom: `to` is the TOKEN CONTRACT, so the real recipient is decoded from calldata.
 * - Any other contract call: no person-recipient can be determined.
 */
export type RecipientKind = 'native' | 'erc20-transfer' | 'contract-call' | 'contract-creation';

export type RecipientResult =
  | { ok: true; kind: 'native' | 'erc20-transfer'; recipient: string; contract?: string }
  | { ok: true; kind: 'contract-call'; recipient: null; contract: string }
  | { ok: true; kind: 'contract-creation'; recipient: null }
  | { ok: false; reason: 'invalid-address' | 'invalid-payload' };

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SELECTOR_TRANSFER = '0xa9059cbb'; // transfer(address,uint256)
const SELECTOR_TRANSFER_FROM = '0x23b872dd'; // transferFrom(address,address,uint256)

export const isHexAddress = (v: unknown): v is string => typeof v === 'string' && ADDRESS.test(v);

/** Lower-case form, used for lookups and comparisons. */
export const normalizeAddress = (v: string): string => v.toLowerCase();

/** Reads the address stored in a 32-byte ABI word (12 zero bytes then 20 address bytes). */
function wordToAddress(word: string): string | null {
  if (!/^[0-9a-fA-F]{64}$/.test(word) || !/^0{24}$/.test(word.slice(0, 24))) return null;
  return `0x${word.slice(24)}`;
}

export function extractRecipient(tx: unknown): RecipientResult {
  if (typeof tx !== 'object' || tx === null || Array.isArray(tx)) return { ok: false, reason: 'invalid-payload' };
  const { to, data } = tx as { to?: unknown; data?: unknown };
  if (data !== undefined && data !== null && typeof data !== 'string') return { ok: false, reason: 'invalid-payload' };
  const calldata = typeof data === 'string' ? data.toLowerCase() : '0x';
  if (calldata !== '0x' && !/^0x([0-9a-f]{2})*$/.test(calldata)) return { ok: false, reason: 'invalid-payload' };

  if (to === undefined || to === null || to === '') {
    return calldata === '0x' ? { ok: false, reason: 'invalid-payload' } : { ok: true, kind: 'contract-creation', recipient: null };
  }
  if (!isHexAddress(to)) return { ok: false, reason: 'invalid-address' };
  const contract = normalizeAddress(to);

  if (calldata === '0x') return { ok: true, kind: 'native', recipient: contract };

  const selector = calldata.slice(0, 10);
  const args = calldata.slice(10);
  if (selector === SELECTOR_TRANSFER && args.length >= 128) {
    const r = wordToAddress(args.slice(0, 64));
    return r ? { ok: true, kind: 'erc20-transfer', recipient: r.toLowerCase(), contract } : { ok: false, reason: 'invalid-address' };
  }
  if (selector === SELECTOR_TRANSFER_FROM && args.length >= 192) {
    const r = wordToAddress(args.slice(64, 128));
    return r ? { ok: true, kind: 'erc20-transfer', recipient: r.toLowerCase(), contract } : { ok: false, reason: 'invalid-address' };
  }
  return { ok: true, kind: 'contract-call', recipient: null, contract };
}
