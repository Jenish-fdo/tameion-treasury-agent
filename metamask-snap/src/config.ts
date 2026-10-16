import packageJson from '../package.json';
import type { SnapConfig } from './types/trust';

/**
 * Build-time configuration. `snap.config.ts` copies these environment variables into the bundle, so every value
 * here is readable by anyone who inspects the Snap: never put a secret in them.
 */
const DEFAULT_NETWORKS: Record<string, string> = { 'eip155:10143': 'Monad Testnet' };

/** "eip155:10143=Monad Testnet,eip155:143=Monad" -> map. Malformed entries are ignored. */
export function parseNetworks(raw: string | undefined): Record<string, string> {
  if (!raw) return { ...DEFAULT_NETWORKS };
  const out: Record<string, string> = {};
  for (const part of raw.split(',')) {
    const i = part.indexOf('=');
    const id = part.slice(0, i).trim();
    const name = part.slice(i + 1).trim();
    if (i > 0 && /^eip155:[1-9][0-9]{0,15}$/.test(id) && name) out[id] = name.slice(0, 40);
  }
  return Object.keys(out).length > 0 ? out : { ...DEFAULT_NETWORKS };
}

export function getConfig(): SnapConfig {
  // Each variable is referenced literally so the bundler can substitute it.
  const apiUrl = process.env.CREDENTIA_API_URL ?? '';
  const apiKey = process.env.CREDENTIA_API_KEY ?? '';
  const timeout = Number(process.env.CREDENTIA_TIMEOUT_MS);
  return {
    apiUrl,
    apiKey: apiKey || undefined,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 4000,
    networks: parseNetworks(process.env.CREDENTIA_NETWORKS),
    demoMode: process.env.CREDENTIA_DEMO_MODE === 'true',
  };
}

export const SNAP_VERSION: string = packageJson.version;
