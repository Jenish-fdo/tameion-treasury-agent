'use client';

import { AnimatePresence, motion, useMotionValueEvent, type MotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import { CredentialCard } from './CredentialCard';

const EASE = [0.22, 1, 0.36, 1] as const;

/** A thin cobalt bar showing how far down the page you are. Transform only; hidden for reduced motion. */
export function ScrollProgress() {
  const reduce = useReducedMotion();
  return reduce ? null : <ProgressBar />;
}

function ProgressBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.3 });
  return <motion.div aria-hidden="true" className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-signal" style={{ scaleX }} />;
}

/** The hero credential drifts slightly slower than the page, so it feels like a sheet lying on the desk. */
export function HeroParallax({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return reduce ? <div>{children}</div> : <ParallaxDrift>{children}</ParallaxDrift>;
}

function ParallaxDrift({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 60]);
  const rotate = useTransform(scrollYProgress, [0, 1], [0.6, -1.2]);
  return (
    <div ref={ref}>
      <motion.div style={{ y, rotate }}>{children}</motion.div>
    </div>
  );
}

const STEPS = [
  { n: '01', title: 'Issue a credential.', body: 'Name the credential and the recipient’s wallet. Credentia anchors a fingerprint of it on Arc.' },
  { n: '02', title: 'Share the link or QR code.', body: 'The link carries the details. Send it, print it, or show the QR code.' },
  { n: '03', title: 'Anyone can verify it instantly.', body: 'Opening the link checks the registry on Arc. No account and no wallet needed.' },
] as const;

const DEMO_LINK = 'https://credentia.example/verify/0x4be1…8f10';

/**
 * One credential, three moments. As you scroll the tall section, the sticky card changes with the active step:
 * drafted (pending) -> shared (QR appears) -> verified (status flips, line is drawn).
 * Native sticky positioning only: the page scrolls normally. On small screens and under reduced motion the steps
 * simply stack and the card shows its final state.
 */
export function ScrollStory() {
  const reduce = useReducedMotion();
  // Scroll tracking is only set up when motion is wanted; otherwise the steps just stack.
  return reduce ? <StoryLayout active={2} reduce /> : <AnimatedStory />;
}

function AnimatedStory() {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  useMotionValueEvent(scrollYProgress, 'change', (v) => setStep(v < 0.34 ? 0 : v < 0.68 ? 1 : 2));
  return <StoryLayout active={step} progress={scrollYProgress} outerRef={ref} />;
}

function StoryLayout({ active, reduce = false, progress, outerRef }: { active: number; reduce?: boolean; progress?: MotionValue<number>; outerRef?: RefObject<HTMLDivElement> }) {
  const status = active >= 2 ? 'VERIFIED' : 'PENDING';
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="border-y border-line bg-paper-deep">
      <div ref={outerRef} className={cn(!reduce && 'md:h-[260vh]')}>
        <div className={cn('container py-16 sm:py-24', !reduce && 'md:sticky md:top-14 md:flex md:min-h-[calc(100vh-3.5rem)] md:items-center md:py-0')}>
          <div className="grid w-full items-center gap-10 md:grid-cols-[1fr_1.05fr]">
            <div>
              <p className="dc-label">How it works</p>
              <h2 id="how-title" className="mt-2 font-display text-4xl sm:text-5xl">Three simple steps.</h2>
              <ol className="relative mt-8 space-y-6 pl-6">
                <span aria-hidden="true" className="absolute bottom-1 left-0 top-1 w-px bg-line" />
                {progress && <FillLine progress={progress} />}
                {STEPS.map((s, i) => (
                  <li key={s.n} aria-current={active === i ? 'step' : undefined} className={cn('transition-[opacity] duration-500', !reduce && active !== i && 'md:opacity-40')}>
                    <p className="font-mono text-sm font-semibold text-signal">{s.n}</p>
                    <h3 className="mt-1 text-xl font-extrabold">{s.title}</h3>
                    <p className="mt-1 max-w-md text-sm text-ink-soft">{s.body}</p>
                  </li>
                ))}
              </ol>
            </div>

            <div className="space-y-4" aria-label="Illustration of one credential moving through the three steps">
              <CredentialCard title="Certificate of Completion" recipientName="Alex Chen" issuer="Example Co." status={status} illustrative issuedAt="2026-10-01 09:41 UTC" />
              <div className="min-h-[148px]">
                <AnimatePresence mode="wait" initial={false}>
                  {active === 0 && <Note key="a" label="Step 1">Details entered. Waiting to be anchored on Arc.</Note>}
                  {active === 1 && (
                    <motion.div key="b" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4, ease: EASE }} className="dc-sheet flex items-center gap-4 bg-sheet p-4">
                      <div className="border border-line bg-white p-2" role="img" aria-label="Sample QR code"><QRCodeSVG value={DEMO_LINK} size={84} level="M" marginSize={0} /></div>
                      <div className="min-w-0"><p className="dc-label">Step 2 · Share</p><p className="mt-1 break-all font-mono text-xs">{DEMO_LINK}</p></div>
                    </motion.div>
                  )}
                  {active >= 2 && <Note key="c" label="Step 3" tone="go">Registry checked, details match, credential active.</Note>}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Cobalt line that fills down the step list as you scroll (md and up). */
function FillLine({ progress }: { progress: MotionValue<number> }) {
  const scaleY = useTransform(progress, [0, 1], [0, 1]);
  return <motion.span aria-hidden="true" className="absolute bottom-1 left-0 top-1 hidden w-0.5 origin-top bg-signal md:block" style={{ scaleY }} />;
}

function Note({ label, tone, children }: { label: string; tone?: 'go'; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4, ease: EASE }}
      className={cn('dc-sheet p-4', tone === 'go' ? 'border-go bg-go-soft' : 'bg-sheet')}
    >
      <p className="dc-label">{label}</p>
      <p className="mt-1 text-sm font-semibold">{children}</p>
    </motion.div>
  );
}
