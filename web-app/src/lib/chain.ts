import { ARC_EXPLORER_URL } from '@/lib/arc';

/** Public (non-secret) chain settings. The explorer URL is only used to build links. */
export const EXPLORER_URL = ARC_EXPLORER_URL;
export const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_CREDENTIAL_REGISTRY_ADDRESS || '';

export const explorerAddressUrl = (address: string): string => `${EXPLORER_URL}/address/${address}`;

/** Only plain https URLs become clickable links; everything else is shown as text. */
export function safeHttpsUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}
