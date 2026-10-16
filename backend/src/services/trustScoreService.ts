import { keccak256, toBytes, type Address } from 'viem';
import { trustScoreAbi } from '../chain/abis.js';
import { publicClient, requireTrustScore, toUpstreamError } from '../chain/clients.js';
import { config } from '../config/index.js';

const FACTORS = {
  credentials: keccak256(toBytes('CREDENTIAL')),
  attestations: keccak256(toBytes('ATTESTATION')),
  staking: keccak256(toBytes('STAKING')),
} as const;

/** The contract scores in basis points (10000 = 100.00). */
const bpsToPoints = (bps: bigint): number => Number(bps) / 100;

export interface TrustScoreResult {
  address: Address;
  score: number; // 0-100
  scoreBps: number; // 0-10000
  breakdown: Record<'credentials' | 'attestations' | 'staking', { points: number; weightBps: number }>;
  lastUpdated: number; // unix seconds, 0 if the score has never been written
}

export class TrustScoreService {
  static async get(address: Address): Promise<TrustScoreResult> {
    const contract = requireTrustScore();
    try {
      const weight = (factor: `0x${string}`) =>
        publicClient.readContract({ address: contract, abi: trustScoreAbi, functionName: 'getFactorWeight', args: [factor] });

      const [breakdown, lastUpdated, wCred, wAtt, wStake] = await Promise.all([
        publicClient.readContract({ address: contract, abi: trustScoreAbi, functionName: 'getScoreBreakdown', args: [address] }),
        publicClient.readContract({ address: contract, abi: trustScoreAbi, functionName: 'getLastUpdated', args: [address] }),
        weight(FACTORS.credentials),
        weight(FACTORS.attestations),
        weight(FACTORS.staking),
      ]);
      const [score, credentialScore, attestationScore, stakingScore] = breakdown;

      return {
        address,
        score: bpsToPoints(score),
        scoreBps: Number(score),
        breakdown: {
          credentials: { points: bpsToPoints(credentialScore), weightBps: Number(wCred) },
          attestations: { points: bpsToPoints(attestationScore), weightBps: Number(wAtt) },
          staking: { points: bpsToPoints(stakingScore), weightBps: Number(wStake) },
        },
        lastUpdated: Number(lastUpdated),
      };
    } catch (err) {
      throw toUpstreamError(err, 'reading the trust score');
    }
  }

  /** Best-effort score lookup (0-100) that never throws; null when unavailable. */
  static async tryGetScore(address: Address): Promise<number | null> {
    if (!config.chain.trustScore) return null;
    try {
      return (await this.get(address)).score;
    } catch {
      return null;
    }
  }
}
