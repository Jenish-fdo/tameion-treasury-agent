import type { Hex } from 'viem';
import { decodePayload, encodePayload, type SharePayload } from './credential';

/**
 * Issued credentials are remembered in THIS browser only (localStorage). It is a convenience list for the issuer's
 * dashboard, not the source of truth: the registry on Arc and the share link are. Clearing site data removes the list
 * but not the credentials.
 */
const KEY = 'credentia.issued.v1';

export interface IssuedEntry {
  id: Hex;
  payload: SharePayload;
}

export function loadIssued(): IssuedEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as { id: string; d: string }[];
    return list.flatMap((e) => {
      const payload = decodePayload(e.d);
      return payload && /^0x[0-9a-fA-F]{64}$/.test(e.id) ? [{ id: e.id as Hex, payload }] : [];
    });
  } catch {
    return [];
  }
}

export function saveIssued(entry: IssuedEntry): void {
  try {
    const next = [entry, ...loadIssued().filter((e) => e.id.toLowerCase() !== entry.id.toLowerCase())].slice(0, 200);
    window.localStorage.setItem(KEY, JSON.stringify(next.map((e) => ({ id: e.id, d: encodePayload(e.payload) }))));
  } catch {
    /* storage unavailable (private mode, quota): the share link still works */
  }
}
