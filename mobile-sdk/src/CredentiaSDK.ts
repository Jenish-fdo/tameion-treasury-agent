import { HttpClient, type FetchLike } from './api/client';
import { fetchAgentCredentials, fetchCredential } from './api/credentials';
import { fetchTrustScore } from './api/trustScore';
import type { Credential, CredentiaSDKConfig, MintParams, TrustScore, TxResult } from './types';
import { prepareIssueCredential } from './utils/web3';

/**
 * Client for the Credentia API. Reads are live API calls. `mintCredential` only PREPARES an unsigned
 * transaction: the SDK holds no keys and never signs or broadcasts.
 *
 * Credentia provides explainable trust and AI risk signals before a payment. It does not guarantee transaction safety.
 */
export class CredentiaSDK {
  private readonly http: HttpClient;

  /** @param fetchImpl Injected for tests; defaults to the platform `fetch`. */
  constructor(private readonly config: CredentiaSDKConfig, fetchImpl?: FetchLike) {
    this.http = new HttpClient(config, fetchImpl);
  }

  checkTrustScore(address: string, options?: { signal?: AbortSignal }): Promise<TrustScore> {
    return fetchTrustScore(this.http, address, options?.signal);
  }

  verifyCredential(credentialId: string, options?: { signal?: AbortSignal }): Promise<Credential> {
    return fetchCredential(this.http, credentialId, options?.signal);
  }

  getAgentCredentials(address: string, options?: { signal?: AbortSignal }): Promise<Credential[]> {
    return fetchAgentCredentials(this.http, address, options?.signal);
  }

  /** Prepares (does not sign or send) a credential issuance. See {@link prepareIssueCredential}. */
  async mintCredential(params: MintParams): Promise<TxResult> {
    return prepareIssueCredential(params, { chainId: this.config.chainId, registryAddress: this.config.registryAddress });
  }
}
