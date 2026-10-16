'use client';

import { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import type { CopilotContext, CopilotDraft, CopilotRequest, CopilotResponse } from '@/lib/dc/copilot-types';

// One availability check per page load, shared by every copilot surface.
let availability: Promise<boolean> | null = null;
function checkAvailability(): Promise<boolean> {
  availability ??= fetch('/api/copilot')
    .then((r) => r.json())
    .then((d: { configured?: boolean }) => Boolean(d.configured))
    .catch(() => false);
  return availability;
}

export const AI_UNAVAILABLE = 'AI summary temporarily unavailable. Onchain verification remains available.';

export function useCopilot() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void checkAvailability().then((ok) => !cancelled && setAvailable(ok));
    return () => {
      cancelled = true;
    };
  }, []);

  async function call(request: CopilotRequest): Promise<CopilotResponse | null> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/copilot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
      const data = (await res.json()) as CopilotResponse;
      if ('error' in data) {
        // Provider trouble (rate limit, outage, no key) never blocks verification, and the page says so.
        setError(res.status >= 429 ? AI_UNAVAILABLE : data.error);
        return null;
      }
      return data;
    } catch {
      setError(AI_UNAVAILABLE);
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { available, busy, error, call };
}

/** Every piece of model output is shown inside one of these, so it is never mistaken for a registry fact. */
export function AiAssisted({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-signal bg-signal-soft p-3">
      <p className="dc-label flex items-center gap-1.5 text-ink">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> AI-assisted · KIMI
      </p>
      <div className="mt-1.5 text-sm">{children}</div>
      <p className="mt-2 text-xs text-ink-soft">Written by a language model and may be wrong. The status and checks on this page are the record; this is a reading aid.</p>
    </div>
  );
}

function Offline() {
  return (
    <p className="mt-2 text-sm text-ink-soft">
      The copilot is offline on this deployment. Set <code className="font-mono text-xs">MOONSHOT_API_KEY</code> on the server to switch on the KIMI assistant.
    </p>
  );
}

function Header({ title }: { title: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="dc-label">{title}</h2>
      <span className="evidence-tag border-signal bg-signal-soft">KIMI · AI-assisted</span>
    </div>
  );
}

function Busy({ children }: { children: string }) {
  return (
    <>
      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      {children}
    </>
  );
}

/** Issuer side: turn a rough description into a title, a description and issuance criteria. */
export function CopilotDraftPanel({ onUse }: { onUse: (draft: CopilotDraft) => void }) {
  const copilot = useCopilot();
  const [idea, setIdea] = useState('');
  const [draft, setDraft] = useState<CopilotDraft | null>(null);

  async function generate() {
    if (!idea.trim()) return;
    setDraft(null);
    const result = await copilot.call({ task: 'draft', idea });
    if (result && 'draft' in result) setDraft(result.draft);
  }

  return (
    <section aria-label="Credential copilot" className="rounded border border-line bg-sheet p-4">
      <Header title="Credential copilot" />
      {copilot.available === false ? (
        <Offline />
      ) : (
        <>
          <label htmlFor="copilot-idea" className="mt-2 block text-sm text-ink-soft">
            Describe what you are certifying. The copilot drafts a title, a description and issuance criteria for you to edit.
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id="copilot-idea"
              className="input min-w-0 flex-1"
              maxLength={500}
              value={idea}
              placeholder="e.g. finished our six-week Solidity course with a passing capstone"
              onChange={(e) => setIdea(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void generate();
                }
              }}
            />
            <button type="button" className="btn-secondary" disabled={copilot.busy || copilot.available !== true} onClick={() => void generate()}>
              {copilot.busy ? <Busy>Drafting…</Busy> : 'Draft'}
            </button>
          </div>
          <div aria-live="polite" className="mt-3 space-y-2">
            {copilot.error && <p role="alert" className="rounded border border-stop bg-stop-soft p-2 text-sm">{copilot.error}</p>}
            {draft && (
              <AiAssisted>
                <p className="font-semibold">{draft.title}</p>
                {draft.description && <p className="mt-1">{draft.description}</p>}
                {draft.criteria.length > 0 && (
                  <>
                    <p className="dc-label mt-3">Suggested issuance criteria</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {draft.criteria.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                    <p className="mt-1 text-xs text-ink-soft">Criteria are for your own process. They are not written to the credential.</p>
                  </>
                )}
                <button type="button" className="btn-secondary mt-3" onClick={() => onUse(draft)}>Use title and description</button>
              </AiAssisted>
            )}
          </div>
        </>
      )}
    </section>
  );
}

const QUESTIONS = ['Is this credential authentic?', 'Who issued this, and are they verified?', 'What does VERIFIED actually prove?'];

/** Verifier side: a summary, and questions about authenticity answered from the page's own data. */
export function CopilotAskPanel({ context }: { context: CopilotContext }) {
  const copilot = useCopilot();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);

  async function send(request: CopilotRequest) {
    setAnswer(null);
    const result = await copilot.call(request);
    if (result && 'text' in result) setAnswer(result.text);
  }

  return (
    <section aria-label="Ask about this credential" className="dc-sheet bg-sheet p-5">
      <Header title="Ask about this credential" />
      {copilot.available === false ? (
        <Offline />
      ) : (
        <>
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (question.trim()) void send({ task: 'ask', question, context });
            }}
          >
            <input aria-label="Question about this credential" className="input min-w-0 flex-1" maxLength={400} value={question} placeholder="Ask about authenticity, the issuer or the checks" onChange={(e) => setQuestion(e.target.value)} />
            <button type="submit" className="btn-secondary" disabled={copilot.busy || copilot.available !== true}>
              {copilot.busy ? <Busy>Reading…</Busy> : 'Ask'}
            </button>
          </form>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="evidence-tag border-signal hover:bg-signal-soft disabled:opacity-50" disabled={copilot.busy || copilot.available !== true} onClick={() => void send({ task: 'summarize', context })}>
              Summarize this credential
            </button>
            {QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                className="evidence-tag border-line normal-case tracking-normal hover:border-ink disabled:opacity-50"
                disabled={copilot.busy || copilot.available !== true}
                onClick={() => {
                  setQuestion(q);
                  void send({ task: 'ask', question: q, context });
                }}
              >
                {q}
              </button>
            ))}
          </div>
          <div aria-live="polite" className="mt-3 space-y-2">
            {copilot.error && <p role="alert" className="rounded border border-stop bg-stop-soft p-2 text-sm">{copilot.error}</p>}
            {answer && <AiAssisted>{answer}</AiAssisted>}
          </div>
        </>
      )}
    </section>
  );
}
