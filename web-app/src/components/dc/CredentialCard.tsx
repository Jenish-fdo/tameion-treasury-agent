import { shortenAddress } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { CredentialStatus } from '@/lib/dc/credential';
import { StatusBadge } from './StatusBadge';
import { VerifyLine } from './motion';

export interface CredentialCardProps {
  title: string;
  recipientName: string;
  /** Display string, normally a shortened address. */
  issuer: string;
  status: CredentialStatus;
  network?: string;
  id?: string;
  tx?: string;
  issuedAt?: string;
  expiry?: string;
  /** Marks sample content that is not a real credential. */
  illustrative?: boolean;
  className?: string;
}

const short = (v: string) => (v.length > 14 ? `${v.slice(0, 8)}…${v.slice(-6)}` : v);

/** The product's signature visual: a credential as a sheet of paper with a cobalt verification line. */
export function CredentialCard({ title, recipientName, issuer, status, network = 'ARC TESTNET', id, tx, issuedAt, expiry, illustrative, className }: CredentialCardProps) {
  return (
    <article aria-label={`Credential: ${title}`} className={cn('dc-paper dc-sheet relative p-6 sm:p-8', className)}>
      <div className="flex items-start justify-between gap-4">
        <p className="dc-label">Credentia / {network}</p>
        <StatusBadge status={status} />
      </div>

      <p className="dc-label mt-8">Credential</p>
      <h3 className="mt-1 font-display text-3xl uppercase leading-tight sm:text-4xl">{title}</h3>

      <VerifyLine className="my-6" />

      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <div>
          <dt className="dc-label">Recipient</dt>
          <dd className="mt-1 text-lg font-semibold">{recipientName}</dd>
        </div>
        <div>
          <dt className="dc-label">Issuer</dt>
          <dd className="mt-1 text-lg font-semibold">{issuer}</dd>
        </div>
        {issuedAt && (
          <div>
            <dt className="dc-label">Issued</dt>
            <dd className="mt-1 font-mono text-sm">{issuedAt}</dd>
          </div>
        )}
        {expiry && (
          <div>
            <dt className="dc-label">Expires</dt>
            <dd className="mt-1 font-mono text-sm">{expiry}</dd>
          </div>
        )}
        {id && (
          <div className="sm:col-span-2">
            <dt className="dc-label">Credential ID</dt>
            <dd className="mt-1 break-all font-mono text-xs" title={id}>{short(id)}</dd>
          </div>
        )}
        {tx && (
          <div className="sm:col-span-2">
            <dt className="dc-label">Transaction</dt>
            <dd className="mt-1 break-all font-mono text-xs" title={tx}>{short(tx)}</dd>
          </div>
        )}
      </dl>

      {illustrative && <p className="dc-label mt-6 border-t border-line pt-3">Illustrative demo data</p>}
    </article>
  );
}

export { shortenAddress };
