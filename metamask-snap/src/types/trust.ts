/** Types for the transaction-insight trust lookup. */

export type TrustCategory = 'LOW' | 'LIMITED' | 'STRONGER' | 'UNKNOWN';

export interface CredentialSummary {
  id: string;
  type: string;
  issuer: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  expiresAt?: number;
}

export interface TrustProfile {
  address: string;
  /** 0-100. */
  score: number;
  category: TrustCategory;
  /** null when the credentials lookup failed: unknown, not zero. */
  activeCredentialCount: number | null;
  credentials?: CredentialSummary[];
  lastActivityAt?: number;
  /** Unix seconds: when the score was last written on-chain (the data timestamp). */
  updatedAt?: number;
  source: 'live' | 'demo' | 'unavailable';
}

export type UnavailableReason = 'not_configured' | 'timeout' | 'network' | 'auth' | 'rate_limited' | 'server' | 'bad_response';

/** Result of a lookup. Anything but `ok` must be shown as "no information", never as a trust signal. */
export type LookupResult =
  | { kind: 'ok'; profile: TrustProfile; network: string }
  | { kind: 'unavailable'; reason: UnavailableReason; network: string }
  | { kind: 'unsupported-network'; chainId: string }
  | { kind: 'invalid-address' };

export interface SnapConfig {
  /** Base URL of the Credentia API. Empty = not configured. */
  apiUrl: string;
  /** Sent as x-api-key. Bundled into the Snap code, so it is NOT secret: use a low-privilege, rate-limited key. */
  apiKey?: string;
  timeoutMs: number;
  /** CAIP-2 id -> display name. Only chains listed here are evaluated. */
  networks: Record<string, string>;
  /** Returns clearly-labelled DEMO profiles instead of calling the API. For manual testing only. */
  demoMode: boolean;
}

export type SnapRpcRequest =
  | { method: 'credentia_getTrustProfile'; params: { address: string; chainId?: string } }
  | { method: 'credentia_getVersion'; params?: undefined };
