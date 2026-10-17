import Link from 'next/link';
import { CredentialCard } from './CredentialCard';
import { Reveal } from './motion';
import { HeroParallax } from './ScrollStory';

export function LandingHero() {
  return (
    <section aria-labelledby="hero-title" className="container grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.05fr_1fr]">
      <div>
        <Reveal>
          <p className="dc-label">Credentia Treasury Autopsy / Arc testnet / early build</p>
          <h1 id="hero-title" className="mt-3 font-display text-5xl leading-[1.02] sm:text-6xl lg:text-7xl">A treasury agent you can audit.</h1>
          <p className="mt-5 max-w-xl text-lg text-ink-soft">An AI agent that manages a small business’s USDC on Arc under a scoped mandate, and signs a replayable record of every decision it makes.</p>
          <p className="mt-3 max-w-xl text-sm text-ink-soft">The agent is not live yet. What works today is the record layer: issue, share and verify signed records on Arc.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/issue" className="btn-primary">Issue a credential</Link>
            <a href="#how-it-works" className="btn-secondary">See how it works</a>
          </div>
        </Reveal>
      </div>
      <Reveal delay={0.15}>
        <HeroParallax>
          <CredentialCard title="Certificate of Completion" recipientName="Alex Chen" issuer="Example Co." status="VERIFIED" illustrative />
        </HeroParallax>
      </Reveal>
    </section>
  );
}

export { ScrollStory as HowItWorks } from './ScrollStory';

export function VerificationSection() {
  return (
    <section aria-labelledby="verify-title" className="container grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-[1fr_1.05fr]">
      <Reveal>
        <p className="dc-label">Instant verification</p>
        <h2 id="verify-title" className="mt-2 font-display text-4xl sm:text-5xl">Trust, verified in one click.</h2>
        <p className="mt-4 max-w-md text-ink-soft">A record’s authenticity and status are checked against the registry on Arc.</p>
        <p className="mt-4 max-w-md text-sm text-ink-soft">If someone edits the details in a link, the check fails and says so. A revoked or expired credential never shows as verified.</p>
      </Reveal>
      <Reveal delay={0.12}>
        <CredentialCard
          title="Certificate of Completion"
          recipientName="Alex Chen"
          issuer="Example Co."
          status="VERIFIED"
          tx="0x9f3ac1d27be84e60b15cd9a02f7e18b34c5d6a90e1b2c3d4e5f60718293a4b5c"
          issuedAt="2026-10-01 09:41 UTC"
          expiry="No expiry"
          id="0x4be1f0a98c2d7365e0b1a49f8d27c6350e9a1b74c2d8f3a6501e7b9c4d2a8f10"
          illustrative
        />
        <p className="mt-3 text-sm">
          <span className="dc-label">Explorer link: </span>
          <span className="text-ink-soft">appears here for real credentials (placeholder in this illustration).</span>
        </p>
      </Reveal>
    </section>
  );
}

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="border-t border-line bg-ink py-16 text-sheet sm:py-24">
      <div className="container max-w-3xl">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-signal-soft">Get started</p>
          <h2 id="cta-title" className="mt-2 font-display text-4xl sm:text-5xl">Issue your first credential.</h2>
          <Link href="/issue" className="mt-8 inline-flex items-center justify-center rounded border border-sheet bg-sheet px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-ink hover:bg-signal-soft">
            Issue credential
          </Link>
          <p className="mt-8 max-w-xl text-sm text-signal-soft">
            Credentia Treasury Autopsy is an early build on Arc testnet. It is not audited and not ready for real funds.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
