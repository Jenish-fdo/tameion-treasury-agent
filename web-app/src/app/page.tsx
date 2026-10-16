import type { Metadata } from 'next';
import { DcShell } from '@/components/dc/DcChrome';
import { FinalCta, HowItWorks, LandingHero, VerificationSection } from '@/components/dc/Landing';
import { ScrollProgress } from '@/components/dc/ScrollStory';
import { SmoothScroll } from '@/components/dc/SmoothScroll';

export const metadata: Metadata = {
  title: 'Credentia — Credentials you can trust',
  description: 'Issue, share, and verify digital credentials in seconds on Monad testnet. A hackathon demonstration.',
};

/** Landing page. Static: needs no wallet, API or network to render. */
export default function Home() {
  return (
    <DcShell wallet={false}>
      <SmoothScroll />
      <ScrollProgress />
      <LandingHero />
      <HowItWorks />
      <VerificationSection />
      <FinalCta />
    </DcShell>
  );
}
