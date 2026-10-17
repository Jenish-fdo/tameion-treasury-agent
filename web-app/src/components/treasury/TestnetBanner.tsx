/** Shown on every treasury screen: this is a testnet build with demo keys, not a product to hold money in. */
export function TestnetBanner() {
  return (
    <div role="note" className="rounded border border-review bg-review-soft p-3 text-sm">
      <strong className="font-mono text-[11px] uppercase tracking-[0.12em]">Arc testnet · managed demo keys · not audited</strong>
      <p className="mt-1">
        These screens act through demo owner keys held by the backend. Real owners will sign in their own Circle wallet in a later phase. The contracts
        record what an agent may do and what it did; they do not hold funds and cannot stop a payment made outside them. Do not use real funds.
      </p>
    </div>
  );
}
