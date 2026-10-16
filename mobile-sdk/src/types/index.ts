/** Public types for the Credentia mobile SDK. */

export type TrustScoreCategory = 'LOW' | 'LIMITED' | 'STRONGER' | 'UNKNOWN';
export type DataSource = 'live' | 'demo' | 'unavailable';

export interface CredentiaSDKConfig {
  /** Base URL of the Credentia API, e.g. https://your-credentia-api.example (no trailing path). */
  apiUrl: string;
  /** Reserved. Not used by the current read operations, which go through the API. */
  rpcUrl?: string;
  /** Chain the prepared transactions target (e.g. 10143 for Monad testnet). Required to prepare a mint. */
  chainId?: number;
  /** CredentialRegistry address. Required to prepare a mint; without it mintCredential returns UNAVAILABLE. */
  registryAddress?: string;
  /** Per-request timeout. Default 10 000 ms. */
  requestTimeoutMs?: number;
  /**
   * API key sent as `x-api-key`. A key bundled in a mobile app can be extracted by anyone who has the app:
   * use a low-privilege, rate-limited key, or put the API behind your own backend.
   */
  apiKey?: string;
}

export interface TrustScore {
  address: string;
  /** 0-100. */
  score: number;
  category: TrustScoreCategory;
  /** Points (0-100) per factor reported by the on-chain TrustScore contract. */
  breakdown?: { credentials?: number; attestations?: number; staking?: number };
  /** Unix seconds; undefined when the address has never been scored. */
  lastUpdated?: number;
  source: DataSource;
}

export type CredentialStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'NOT_FOUND';

export interface Credential {
  id: string;
  /** Empty string when status is NOT_FOUND. */
  subject: string;
  /** Empty string when status is NOT_FOUND. */
  issuer: string;
  /** "unknown" when the API does not return a type for this credential. */
  type: string;
  status: CredentialStatus;
  issuedAt?: number;
  /** Unix seconds; undefined means no expiry. */
  expiresAt?: number;
  metadataUri?: string;
}

export interface MintParams {
  subject: string;
  credentialType: string;
  /** Unix seconds; 0 means no expiry. */
  expiresAt: number;
  metadataUri?: string;
}

export type TxStatus = 'PREPARED' | 'AWAITING_SIGNATURE' | 'SUBMITTED' | 'CONFIRMED' | 'UNAVAILABLE';

export interface TxResult {
  status: TxStatus;
  transactionHash?: string;
  credentialId?: string;
  preparedTransaction?: { to: string; data: string; value: string; chainId: number };
  message?: string;
}
