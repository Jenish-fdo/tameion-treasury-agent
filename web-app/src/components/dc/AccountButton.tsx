'use client';

import { UserRound } from 'lucide-react';

/**
 * Placeholder for the account control. Account sign-in is being rebuilt around Circle wallets (see
 * components/account.tsx), so this is a disabled button that says so instead of a control that cannot work.
 */
export function AccountButton({ label = 'Sign-in coming soon' }: { label?: string }) {
  return (
    <button type="button" className="btn-secondary" disabled title="Account sign-in is being rebuilt around Circle wallets. Demo mode still works.">
      <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}
