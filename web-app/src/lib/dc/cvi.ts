import type { Address } from 'viem';
import type { ChainCvi } from './registry';

/**
 * Cleanverse Verified Identity (CVI) status (testnet demo stand-in).
 *
 * NOTE: There is no real Cleanverse CVI access or API integration in this project.
 * The CVI gate and oracle serve strictly as a testnet demo stand-in.
 * No real Cleanverse integration or bounty eligibility is claimed.
 *
 * On a deployed registry the answer comes from the registry's CVI verifier contract. In demo mode
 * (no registry configured) there is nothing to ask, so verification can only be SIMULATED, and it is
 * labelled that way everywhere it appears.
 */
export type CviState = 'VERIFIED' | 'NOT_VERIFIED' | 'EXPIRED' | 'GATE_OFF' | 'DEMO_VERIFIED' | 'DEMO_NOT_VERIFIED' | 'UNKNOWN';

export interface CviStatus {
  state: CviState;
  tier: number;
  /** Unix seconds; 0 = no expiry. */
  expiresAt: number;
  /** Plain-language explanation shown beside the badge. */
  detail: string;
}

export const CVI_LABEL: Record<CviState, string> = {
  VERIFIED: 'CVI VERIFIED',
  NOT_VERIFIED: 'CVI NOT VERIFIED',
  EXPIRED: 'CVI EXPIRED',
  GATE_OFF: 'CVI GATE OFF',
  DEMO_VERIFIED: 'DEMO · CVI SIMULATED',
  DEMO_NOT_VERIFIED: 'DEMO · NOT VERIFIED',
  UNKNOWN: 'CVI UNKNOWN',
};

/** Whether this status lets an issuer through the gate. */
export const cviAllowsIssuing = (s: CviState): boolean => s === 'VERIFIED' || s === 'DEMO_VERIFIED' || s === 'GATE_OFF';

export function cviFromChain(c: ChainCvi, nowSec: number): CviStatus {
  if (!c.gateOn) {
    return { state: 'GATE_OFF', tier: 0, expiresAt: 0, detail: 'This registry does not require Cleanverse verification (demo stand-in) to issue.' };
  }
  if (c.verified) {
    return { state: 'VERIFIED', tier: c.tier, expiresAt: c.expiresAt, detail: 'This wallet holds a Cleanverse Verified Identity testnet demo stand-in attested on Monad.' };
  }
  if (c.updatedAt !== 0 && c.expiresAt !== 0 && c.expiresAt <= nowSec) {
    return { state: 'EXPIRED', tier: c.tier, expiresAt: c.expiresAt, detail: 'This wallet’s testnet stand-in verification has lapsed.' };
  }
  return { state: 'NOT_VERIFIED', tier: 0, expiresAt: 0, detail: 'No testnet demo stand-in verification is attested for this wallet.' };
}

export const CVI_UNKNOWN: CviStatus = { state: 'UNKNOWN', tier: 0, expiresAt: 0, detail: 'The CVI record could not be read right now.' };

// --- demo mode: simulated verification, this browser only ---------------------------------------------------------

const DEMO_KEY = 'credentia.cvi.demo.v1';

function demoSet(): string[] {
  try {
    const raw = window.localStorage.getItem(DEMO_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((a): a is string => typeof a === 'string') : [];
  } catch {
    return [];
  }
}

export function demoCvi(wallet: Address | undefined): CviStatus {
  const verified = Boolean(wallet) && demoSet().includes(wallet!.toLowerCase());
  return verified
    ? { state: 'DEMO_VERIFIED', tier: 1, expiresAt: 0, detail: 'Simulated for this demo. No Cleanverse check was made and nothing is on-chain (testnet demo stand-in).' }
    : { state: 'DEMO_NOT_VERIFIED', tier: 0, expiresAt: 0, detail: 'Demo mode: testnet demo stand-in without real Cleanverse CVI access.' };
}

/** Marks a wallet as CVI-verified for the demo only. Never affects a real registry. */
export function setDemoCvi(wallet: Address, verified: boolean): void {
  try {
    const key = wallet.toLowerCase();
    const next = demoSet().filter((a) => a !== key);
    if (verified) next.push(key);
    window.localStorage.setItem(DEMO_KEY, JSON.stringify(next.slice(-50)));
  } catch {
    /* storage unavailable: the simulation simply does not persist */
  }
}
