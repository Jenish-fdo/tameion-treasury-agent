import type { Address, Hex } from 'viem';
import type { ActivityItem, CredentialInsight, IssuerRecord } from './insight';

/**
 * Envio HyperIndex client. An indexer turns CredentialRegistry events into
 * queryable rows; this reads them over its GraphQL endpoint. Set NEXT_PUBLIC_ENVIO_URL to switch it on
 * (http://localhost:8080/v1/graphql for `envio dev`, or the hosted endpoint).
 */
const ENVIO_URL = process.env.NEXT_PUBLIC_ENVIO_URL ?? '';
export const envioEnabled = /^https?:\/\//.test(ENVIO_URL);

async function query<T>(document: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENVIO_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: document, variables }) });
  if (!res.ok) throw new Error(`indexer responded ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length || !body.data) throw new Error(body.errors?.[0]?.message ?? 'indexer returned no data');
  return body.data;
}

interface ActivityRow {
  kind: ActivityItem['kind'];
  credential: string | null;
  actor: string;
  valid: boolean | null;
  timestamp: number;
  txHash: string;
}
interface IssuerRow {
  id: string;
  issued: number;
  revoked: number;
  checks: number;
  score: number;
}

const ACTIVITY_FIELDS = 'kind credential actor valid timestamp txHash';
const ISSUER_FIELDS = 'id issued revoked checks score';

const toActivity = (r: ActivityRow): ActivityItem => ({
  kind: r.kind,
  credentialId: (r.credential ?? undefined) as Hex | undefined,
  actor: r.actor as Address,
  valid: r.valid ?? undefined,
  timestamp: r.timestamp,
  txHash: r.txHash as Hex,
});

const toIssuer = (r: IssuerRow): IssuerRecord => ({
  address: r.id as Address,
  issued: r.issued,
  revoked: r.revoked,
  checks: r.checks,
  score: r.score,
});

/** Status inputs, verification history and the issuer's record for one credential. */
export async function fetchInsight(id: Hex, issuer: Address | undefined): Promise<CredentialInsight> {
  const data = await query<{ Credential: { checkCount: number }[]; Activity: ActivityRow[]; Issuer: IssuerRow[] }>(
    `query Insight($id: String!, $issuer: String!) {
      Credential(where: { id: { _eq: $id } }) { checkCount }
      Activity(where: { credential: { _eq: $id } }, order_by: { timestamp: desc }, limit: 25) { ${ACTIVITY_FIELDS} }
      Issuer(where: { id: { _eq: $issuer } }) { ${ISSUER_FIELDS} }
    }`,
    { id: id.toLowerCase(), issuer: (issuer ?? '').toLowerCase() },
  );
  return {
    source: 'envio',
    verificationCount: data.Credential[0]?.checkCount ?? 0,
    history: data.Activity.map(toActivity),
    issuer: data.Issuer[0] ? toIssuer(data.Issuer[0]) : null,
  };
}

/** Latest events across the whole registry, newest first. */
export async function fetchRecentActivity(limit = 8): Promise<ActivityItem[]> {
  const data = await query<{ Activity: ActivityRow[] }>(
    `query Recent($limit: Int!) { Activity(order_by: { timestamp: desc }, limit: $limit) { ${ACTIVITY_FIELDS} } }`,
    { limit },
  );
  return data.Activity.map(toActivity);
}

export async function fetchIssuer(issuer: Address): Promise<IssuerRecord | null> {
  const data = await query<{ Issuer: IssuerRow[] }>(`query Issuer($issuer: String!) { Issuer(where: { id: { _eq: $issuer } }) { ${ISSUER_FIELDS} } }`, {
    issuer: issuer.toLowerCase(),
  });
  return data.Issuer[0] ? toIssuer(data.Issuer[0]) : null;
}
