import type { Metadata } from 'next';
import { DM_Serif_Display, IBM_Plex_Mono, Manrope } from 'next/font/google';
import '@/styles/globals.css';
import { Providers } from '@/components/providers';

// DM Serif Display: large editorial headings only. IBM Plex Mono: data, labels, stamps. Manrope: everything else.
const display = DM_Serif_Display({ subsets: ['latin'], weight: '400', variable: '--font-display', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono', display: 'swap' });
const body = Manrope({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: 'Credentia — Verify anyone before you pay them',
  description:
    'Credentia is a portable identity and payment-trust layer for humans and AI agents on Monad. It provides explainable AI risk signals before a payment; it does not guarantee transaction safety.',
  authors: [{ name: 'Credentia' }],
  openGraph: {
    title: 'Credentia — Verify anyone before you pay them',
    description: 'Explainable payment-risk signals for humans and AI agents on Monad.',
    type: 'website',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${display.variable} ${mono.variable} ${body.variable} font-body antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
