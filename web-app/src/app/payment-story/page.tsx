import type { Metadata } from 'next';
import '@/styles/story.css';
import { ChapterAnalystReports } from '@/components/story/ChapterAnalystReports';
import { ChapterCaseFile } from '@/components/story/ChapterCaseFile';
import { ChapterCTA } from '@/components/story/ChapterCTA';
import { ChapterDecision } from '@/components/story/ChapterDecision';
import { ChapterMissingEvidence } from '@/components/story/ChapterMissingEvidence';
import { ChapterTransfer } from '@/components/story/ChapterTransfer';
import { StoryShell } from '@/components/story/StoryShell';

export const metadata: Metadata = {
  title: 'Credentia — Payment evidence story',
  description: 'A payment becomes a case file: credentials, context and three independent risk assessments before money moves.',
};

/** The landing story. Static, with no wallet, API or provider calls. */
export default function PaymentStory() {
  return (
    <StoryShell>
      <ChapterTransfer />
      <ChapterMissingEvidence />
      <ChapterCaseFile />
      <ChapterAnalystReports />
      <ChapterDecision />
      <ChapterCTA />
    </StoryShell>
  );
}
