'use client';

import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { useOrigin } from '@/hooks/useOrigin';

export async function copyText(text: string, message = 'Link copied'): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
    return true;
  } catch {
    toast.error('Could not copy automatically. Select the link and copy it.');
    return false;
  }
}

export function CopyLinkButton({ path, className = 'btn-secondary' }: { path: string; className?: string }) {
  const origin = useOrigin();
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    if (await copyText(`${origin}${path}`)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };
  return (
    <button type="button" className={className} disabled={!origin} onClick={onCopy} aria-live="polite">
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}

/** Shareable link, QR code and actions for one credential. `path` is the verification path including its payload. */
export function ShareBlock({ id, path }: { id: string; path: string }) {
  const origin = useOrigin();
  const url = origin ? `${origin}${path}` : '';
  return (
    <section aria-labelledby="share-heading" className="dc-sheet dc-paper p-6">
      <h2 id="share-heading" className="dc-label">Share this credential</h2>
      <div className="mt-4 grid gap-6 sm:grid-cols-[auto_1fr]">
        <div className="self-start border border-line bg-white p-3" role="img" aria-label="QR code for the verification link">
          {url ? <QRCodeSVG value={url} size={168} level="M" marginSize={0} /> : <div className="h-[168px] w-[168px]" />}
        </div>
        <div className="min-w-0 space-y-4">
          <div>
            <p className="dc-label">Credential ID</p>
            <p className="mt-1 break-all font-mono text-xs">{id}</p>
          </div>
          <div>
            <label htmlFor="share-url" className="dc-label">Verification link</label>
            <input id="share-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="input mt-1 font-mono text-xs" />
          </div>
          <div className="flex flex-wrap gap-3">
            <CopyLinkButton path={path} className="btn-primary" />
            <Link href={path} className="btn-secondary">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Open verification page
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
