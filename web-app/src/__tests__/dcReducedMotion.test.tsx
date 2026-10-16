// The user prefers reduced motion. motion reads the preference lazily on first use, so it is set before any render.
import './ioStub';
import { render, screen } from '@testing-library/react';
import { Reveal, VerifyLine } from '@/components/dc/motion';
import { HowItWorks, LandingHero } from '@/components/dc/Landing';

beforeAll(() => {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query, onchange: null, addListener: jest.fn(), removeListener: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
  }));
});

describe('reduced-motion fallback', () => {
  it('renders every Reveal child immediately, in reading order, with no hidden starting state', () => {
    render(<ol><Reveal as="li">first</Reveal><Reveal as="li">second</Reveal></ol>);
    const items = screen.getAllByRole('listitem');
    expect(items.map((i) => i.textContent)).toEqual(['first', 'second']);
    items.forEach((i) => {
      expect(i.getAttribute('style') ?? '').not.toMatch(/opacity:\s*0/);
      expect(i.getAttribute('style') ?? '').not.toMatch(/translate/);
    });
  });

  it('shows the verification line fully drawn (no scale animation)', () => {
    const { container } = render(<VerifyLine />);
    const line = container.firstElementChild as HTMLElement;
    expect(line.getAttribute('style') ?? '').not.toMatch(/scale/);
  });

  it('keeps the whole landing story readable: all headings and CTAs are present', () => {
    render(<><LandingHero /><HowItWorks /></>);
    expect(screen.getByRole('heading', { level: 1, name: 'Credentials you can trust.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Issue a credential.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Share the link or QR code.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Anyone can verify it instantly.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Issue a credential' })).toBeVisible();
  });
});
