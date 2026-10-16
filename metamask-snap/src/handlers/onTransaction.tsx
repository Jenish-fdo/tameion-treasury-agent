import type { OnTransactionHandler } from '@metamask/snaps-sdk';
import { getConfig } from '../config';
import { lookupTrustProfile } from '../services/credentiaApi';
import { NoRecipientInsight, TrustInsight, UnavailableInsight, UnsupportedNetworkInsight } from '../ui/components';
import { extractRecipient } from '../utils/transaction';

/**
 * Transaction insight. Reads the UNSIGNED transaction MetaMask is about to ask the user to sign, looks up the
 * recipient's public trust profile, and shows it. It never blocks, signs or alters the transaction, and sets no
 * severity (so MetaMask adds no warning of its own): the user always decides.
 */
export const onTransaction: OnTransactionHandler = async ({ transaction, chainId }) => {
  const cfg = getConfig();
  const r = extractRecipient(transaction);

  if (!r.ok) return { content: <NoRecipientInsight reason="Credentia could not read a valid recipient from this transaction." /> };
  if (r.recipient === null) {
    return {
      content: (
        <NoRecipientInsight
          reason={r.kind === 'contract-creation' ? 'This transaction creates a contract, so there is no recipient to look up.' : 'This is a contract interaction, not a payment to a person or agent. Credentia did not look up a trust profile.'}
        />
      ),
    };
  }

  const result = await lookupTrustProfile(cfg, r.recipient, chainId, (url, init) => fetch(url, init));
  switch (result.kind) {
    case 'ok':
      return { content: <TrustInsight profile={result.profile} network={result.network} viaToken={r.kind === 'erc20-transfer'} /> };
    case 'unavailable':
      return { content: <UnavailableInsight reason={result.reason} network={result.network} /> };
    case 'unsupported-network':
      return { content: <UnsupportedNetworkInsight /> };
    default:
      return { content: <NoRecipientInsight reason="Credentia could not read a valid recipient from this transaction." /> };
  }
};
