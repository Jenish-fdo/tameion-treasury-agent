import type { Address } from 'viem';
import type { IntentBody } from '../schemas/api.js';
import type { ConsensusResult } from '../types/ai.js';
import { aiConsensusService } from './aiConsensusService.js';
import { TrustScoreService } from './trustScoreService.js';

/** Glue between the HTTP layer and the AI consensus engine: adds the parties' on-chain trust scores. */
export class IntentService {
  static async evaluate(intent: IntentBody): Promise<ConsensusResult> {
    const [senderTrustScore, recipientTrustScore] = await Promise.all([
      TrustScoreService.tryGetScore(intent.from as Address),
      TrustScoreService.tryGetScore(intent.to as Address),
    ]);
    return aiConsensusService.evaluateIntent(intent, { senderTrustScore, recipientTrustScore });
  }
}
