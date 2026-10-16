import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import Home from '@/app/payment-story/page';

type Entry = Partial<IntersectionObserverEntry> & { target: Element };
class MockIO {
  static instances: MockIO[] = [];
  observed = new Set<Element>();
  constructor(public cb: (entries: Entry[]) => void) {
    MockIO.instances.push(this);
  }
  observe(el: Element) { this.observed.add(el); }
  unobserve(el: Element) { this.observed.delete(el); }
  disconnect() { this.observed.clear(); }
  takeRecords() { return []; }
}
const fire = (isIntersecting: boolean, top = 100) =>
  act(() => {
    for (const io of MockIO.instances) if (io.observed.size > 0) io.cb([...io.observed].map((target) => ({ target, isIntersecting, boundingClientRect: { top } as DOMRect })));
  });

function setReducedMotion(reduce: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: reduce, media: query, addEventListener: jest.fn(), removeEventListener: jest.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  MockIO.instances = [];
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = MockIO;
  setReducedMotion(false);
});
afterEach(() => {
  delete (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
  jest.restoreAllMocks();
});

const board = () => screen.getByRole('tabpanel');
const continueBtn = () => screen.getByRole('button', { name: /Continue to payment \(illustration\)/ });

describe('landing story: content', () => {
  it('has six chapters with one h1 and the specified headlines', () => {
    const { container } = render(<Home />);
    expect(container.querySelectorAll('section[id^="chapter-"]')).toHaveLength(6);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Money moves in seconds.Trust usually arrives too late.');
    expect(screen.getByRole('heading', { name: 'A wallet address is not a reputation.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Credentia turns a payment into a reviewable case.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /One payment\.\s*Three independent assessments\./ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Proceed only when the evidence agrees.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Trust checks belong inside the payment flow.' })).toBeInTheDocument();
  });

  it('labels every illustrative value and shows the specified demo data', () => {
    render(<Home />);
    expect(screen.getAllByText('DEMO DATA').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1,250.00 AUSD').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0x7F3a…91Bc').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Simulated model output/i)).toHaveLength(3);
    expect(screen.getByText(/Demo trust profile \/ illustrative data/i)).toBeInTheDocument();
    for (const r of ['Known credential pattern; context consistent.', 'No high-risk language identified.', 'Counterparty history is limited.']) {
      expect(screen.getByText(`“${r}”`)).toBeInTheDocument();
    }
  });

  it('links to /payment-check from the skip link, header, first chapter and last chapter', () => {
    render(<Home />);
    const links = screen.getAllByRole('link').filter((a) => a.getAttribute('href') === '/payment-check');
    expect(links.length).toBeGreaterThanOrEqual(4);
    expect(screen.getByRole('link', { name: 'Skip story — open payment check' })).toHaveAttribute('href', '/payment-check');
    expect(screen.getAllByRole('link', { name: 'Open payment check' }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('link', { name: 'Try the live payment check' })).toHaveAttribute('href', '/payment-check');
    expect(screen.getByRole('link', { name: /View the evidence/ })).toHaveAttribute('href', '#chapter-02');
    expect(screen.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '#how-it-works');
  });

  it('states that Credentia does not guarantee safety', () => {
    render(<Home />);
    expect(screen.getByText('Credentia provides explainable AI risk signals before a payment. It does not guarantee transaction safety.')).toBeInTheDocument();
  });

  it('makes no network request: the story works with no backend, wallet or provider', async () => {
    render(<Home />);
    await userEvent.click(screen.getByRole('tab', { name: 'STOP' }));
    await userEvent.click(screen.getByRole('tab', { name: 'GO' }));
    await userEvent.click(continueBtn());
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('renders every chapter as plain HTML with nothing hidden (no JavaScript needed)', () => {
    const html = renderToString(<Home />).replace(/<!-- -->/g, ''); // React's text-node separators
    for (const text of ['Money moves in seconds.', 'A wallet address is not a reputation.', 'IDENTITY CREDENTIAL — VERIFIED', 'TRUST INDICATOR — 87 / 100', 'KIMI / REPORT 01', 'Proceed only when the evidence agrees.', 'CASE CLOSED / NEXT ACTION']) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain('is-pending');
    expect(html).not.toContain('is-armed');
  });
});

describe('chapter 05: decision tabs', () => {
  it('starts on GO with the specified values and an enabled illustrative continue control', () => {
    render(<Home />);
    expect(screen.getByRole('tab', { name: 'GO' })).toHaveAttribute('aria-selected', 'true');
    const p = within(board());
    expect(p.getByRole('img', { name: 'Verdict: CLEARED / GO' })).toBeInTheDocument();
    expect(screen.getByTestId('decision-confidence')).toHaveTextContent('87 / 100');
    expect(screen.getByTestId('decision-agreement')).toHaveTextContent('80%');
    expect(screen.getByTestId('decision-action')).toHaveTextContent('Safe to proceed');
    expect(screen.getByTestId('decision-flag')).toHaveTextContent('No flags raised');
    expect(continueBtn()).toBeEnabled();
  });

  it('STOP updates stamp, numbers, flag and action, and disables continue', async () => {
    render(<Home />);
    await userEvent.click(screen.getByRole('tab', { name: 'STOP' }));
    expect(screen.getByRole('tab', { name: 'STOP' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'GO' })).toHaveAttribute('aria-selected', 'false');
    expect(within(board()).getByRole('img', { name: 'Verdict: BLOCKED / STOP' })).toBeInTheDocument();
    expect(screen.getByTestId('decision-confidence')).toHaveTextContent('91 / 100');
    expect(screen.getByTestId('decision-agreement')).toHaveTextContent('86%');
    expect(screen.getByTestId('decision-flag')).toHaveTextContent('Recipient behavior requires review');
    expect(screen.getByTestId('decision-action')).toHaveTextContent('Payment blocked — elevated risk detected.');
    expect(board()).toHaveClass('bg-stop-soft');
    expect(continueBtn()).toBeDisabled();
    expect(within(board()).getByText('Do not send')).toBeInTheDocument();
  });

  it('REVIEW updates stamp, numbers, flag and action, and disables continue', async () => {
    render(<Home />);
    await userEvent.click(screen.getByRole('tab', { name: 'REVIEW' }));
    expect(within(board()).getByRole('img', { name: 'Verdict: HOLD / REVIEW' })).toBeInTheDocument();
    expect(screen.getByTestId('decision-confidence')).toHaveTextContent('66 / 100');
    expect(screen.getByTestId('decision-agreement')).toHaveTextContent('52%');
    expect(screen.getByTestId('decision-flag')).toHaveTextContent('Model signals are inconclusive');
    expect(screen.getByTestId('decision-action')).toHaveTextContent('Manual review required — do not send yet.');
    expect(board()).toHaveClass('bg-review-soft');
    expect(continueBtn()).toBeDisabled();
    expect(within(board()).getByText('Pause and verify manually')).toBeInTheDocument();
  });

  it('returning to GO re-enables continue; clicking it only explains and links to the live check', async () => {
    render(<Home />);
    await userEvent.click(screen.getByRole('tab', { name: 'REVIEW' }));
    await userEvent.click(screen.getByRole('tab', { name: 'GO' }));
    expect(continueBtn()).toBeEnabled();
    await userEvent.click(continueBtn());
    expect(screen.getByRole('status')).toHaveTextContent('Illustration only: no payment flow exists on this page.');
    expect(within(screen.getByRole('status')).getByRole('link')).toHaveAttribute('href', '/payment-check');
  });

  it('explains confidence and agreement in visible text', () => {
    render(<Home />);
    expect(screen.getByText('How strongly the available models assessed the result.')).toBeInTheDocument();
    expect(screen.getByText('How much weighted model support the verdict received.')).toBeInTheDocument();
  });

  it('is keyboard operable: arrow keys, Home and End move selection and focus (roving tabindex)', async () => {
    render(<Home />);
    const go = screen.getByRole('tab', { name: 'GO' });
    go.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'STOP' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'STOP' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'STOP' })).toHaveAttribute('tabindex', '0');
    expect(go).toHaveAttribute('tabindex', '-1');
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'REVIEW' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'GO' })).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'REVIEW' })).toHaveFocus();
    expect(board()).toHaveAttribute('aria-labelledby', 'tab-REVIEW');
  });

  it('plays the stamp arrival animation once, when the board first scrolls into view', () => {
    render(<Home />);
    expect(document.querySelector('.stamp-arrive')).toBeNull();
    fire(true);
    expect(document.querySelector('.stamp-arrive')).not.toBeNull();
  });
});

describe('motion and progress', () => {
  it('full motion: dossier evidence arrives as captions pass, and lines are drawn with them', () => {
    let captionTop = 5000; // below the fold
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({ top: captionTop }) as DOMRect);
    const { container } = render(<Home />);
    expect(container.querySelector('.story')).toHaveAttribute('data-motion', 'full');
    expect(container.querySelectorAll('.insert')).toHaveLength(4);
    expect(container.querySelectorAll('.insert.is-pending')).toHaveLength(4);
    expect(container.querySelectorAll('.line-draw.is-armed:not(.is-drawn)')).toHaveLength(4);

    captionTop = 100; // captions have reached the reading position
    fire(true);
    expect(container.querySelectorAll('.insert.is-pending')).toHaveLength(0);
    expect(container.querySelectorAll('.line-draw.is-drawn')).toHaveLength(4);

    captionTop = 5000; // scrolled back up: evidence is withdrawn again
    fire(false);
    expect(container.querySelectorAll('.insert.is-pending')).toHaveLength(4);
  });

  it('full motion: jumping past the chapter (anchor link) still reveals everything that was passed', () => {
    // Captions are far above the viewport and never reported a visibility change.
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({ top: -3000 }) as DOMRect);
    const { container } = render(<Home />);
    expect(container.querySelectorAll('.insert.is-pending')).toHaveLength(0);
    expect(container.querySelectorAll('.line-draw.is-drawn')).toHaveLength(4);
  });

  it('full motion: below-the-fold blocks are armed for reveal, then shown', () => {
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: 5000 } as DOMRect);
    const { container } = render(<Home />);
    const pending = container.querySelectorAll('[data-reveal].is-pending');
    expect(pending.length).toBeGreaterThan(5);
    fire(true);
    expect(container.querySelectorAll('[data-reveal].is-pending')).toHaveLength(0);
  });

  it('updates the chapter progress as chapters pass the middle of the screen', () => {
    render(<Home />);
    const nav = screen.getByRole('navigation', { name: 'Story chapters' });
    expect(within(nav).getAllByRole('link')).toHaveLength(6);
    expect(within(nav).getByRole('link', { name: /Chapter 01/ })).toHaveAttribute('aria-current', 'location');
    act(() => {
      for (const io of MockIO.instances) {
        const target = [...io.observed].find((el) => el.id === 'chapter-04');
        if (target) io.cb([{ target, isIntersecting: true }]);
      }
    });
    expect(within(nav).getByRole('link', { name: /Chapter 04/ })).toHaveAttribute('aria-current', 'location');
    expect(within(nav).getByRole('link', { name: /Chapter 01/ })).not.toHaveAttribute('aria-current');
  });

  it('reduced motion: a plain stacked document with all evidence visible and nothing armed or pinned', () => {
    setReducedMotion(true);
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: 5000 } as DOMRect);
    const { container } = render(<Home />);
    expect(container.querySelector('.story')).toHaveAttribute('data-motion', 'reduce');
    expect(container.querySelectorAll('.is-pending')).toHaveLength(0);
    expect(container.querySelectorAll('.line-draw.is-armed')).toHaveLength(0);
    expect(container.querySelectorAll('.line-draw')).toHaveLength(4);
    // All narrative and evidence text is present and readable.
    for (const t of ['IDENTITY CREDENTIAL — VERIFIED', 'ACCOUNT HISTORY — DEMO PROFILE', 'CONTEXT NOTE — “Invoice #42”', 'TRUST INDICATOR — 87 / 100']) {
      expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole('heading', { name: 'Proceed only when the evidence agrees.' })).toBeVisible();
    // The caption observer (which drives the dossier) is never created in this mode.
    expect(MockIO.instances.some((io) => [...io.observed].some((el) => el.tagName === 'LI'))).toBe(false);
  });

  it('works without IntersectionObserver at all (older browsers): everything stays visible', () => {
    delete (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
    const { container } = render(<Home />);
    expect(container.querySelectorAll('.is-pending')).toHaveLength(0);
    expect(container.querySelectorAll('.line-draw.is-armed')).toHaveLength(0);
  });
});
