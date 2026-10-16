import type { Check } from './checks';
import type { CopilotContext } from './copilot-types';
import { STATUS_LABEL, type Assessment, type OnChainCredential, type SharePayload } from './credential';
import { CVI_LABEL, type CviStatus } from './cvi';
import { fmtExpiry, fmtUnix } from './format';
import { ACTIVITY_LABEL, type CredentialInsight } from './insight';

const CHECK_RESULT = { pass: 'passed', fail: 'failed', skip: 'skipped' } as const;
const SOURCE = { envio: 'Envio HyperIndex indexer', chain: 'direct registry reads (no event history)', demo: 'demo data in this browser, nothing on-chain' } as const;

/** Everything the copilot may talk about, taken from what the verification page already worked out. */
export function buildCopilotContext(input: {
  id: string;
  payload: SharePayload | null;
  chain: OnChainCredential | null | undefined;
  assessment: Assessment;
  checks: Check[];
  cvi: CviStatus | null;
  insight: CredentialInsight | null;
}): CopilotContext {
  const { id, payload, chain, assessment, checks, cvi, insight } = input;
  const issuedSec = chain?.issuedAt ?? payload?.issuedAt ?? 0;
  const record = insight?.issuer;
  return {
    verification: {
      status: STATUS_LABEL[assessment.status],
      detail: assessment.detail,
      checks: checks.map((c) => ({ label: c.label, result: CHECK_RESULT[c.state], note: c.note })),
    },
    credential: {
      id,
      title: payload?.title ?? null,
      recipientName: payload?.recipientName ?? null,
      description: payload?.description || null,
      issuer: chain?.issuer ?? payload?.issuer ?? null,
      holder: chain?.holder ?? payload?.holder ?? null,
      issued: issuedSec ? fmtUnix(issuedSec) : null,
      expires: fmtExpiry(chain?.expiryTimestamp ?? payload?.expiry ?? 0),
      transaction: payload?.tx ?? null,
      highAssurance: insight?.highAssurance ?? false,
      network: payload?.demo ? 'none (demo credential, never anchored)' : 'Monad testnet (10143)',
    },
    issuer: {
      address: chain?.issuer ?? payload?.issuer ?? null,
      cviStatus: cvi ? CVI_LABEL[cvi.state] : 'not available',
      cviDetail: cvi?.detail ?? 'The issuer’s Cleanverse verification (testnet stand-in) could not be read.',
      record: record ? { issued: record.issued, revoked: record.revoked, verificationsRecorded: record.checks, reputationScore: record.score } : null,
      recordSource: insight ? SOURCE[insight.source] : 'not available',
    },
    activity: (insight?.history ?? []).slice(0, 10).map((a) => ({
      event: ACTIVITY_LABEL[a.kind],
      when: fmtUnix(a.timestamp),
      ...(a.kind === 'CHECKED' && a.valid !== undefined ? { result: a.valid ? 'valid' : 'not valid' } : {}),
    })),
    verificationCount: insight?.verificationCount ?? 0,
  };
}
