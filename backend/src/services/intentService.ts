import type { IntentBody } from '../schemas/api.js';
import type { ConsensusResult } from '../types/ai.js';
import { aiConsensusService } from './aiConsensusService.js';

/** Glue between the HTTP layer and the AI consensus engine. */
export class IntentService {
  static async evaluate(intent: IntentBody): Promise<ConsensusResult> {
    return aiConsensusService.evaluateIntent(intent);
  }
}
