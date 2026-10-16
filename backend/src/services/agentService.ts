import type { Address } from 'viem';
import { CredentialService, type CredentialView } from './credentialService.js';
import { TrustScoreService } from './trustScoreService.js';

export class AgentService {
  static async getCredentials(address: Address): Promise<{ credentials: CredentialView[]; trustScore: number | null }> {
    const [credentials, trustScore] = await Promise.all([
      CredentialService.listActiveForSubject(address),
      // null only when no TrustScore contract is configured; chain errors propagate as 502.
      TrustScoreService.get(address).then((r) => r.score).catch((err) => {
        if ((err as { code?: string }).code === 'NOT_CONFIGURED') return null;
        throw err;
      }),
    ]);
    return { credentials, trustScore };
  }
}
