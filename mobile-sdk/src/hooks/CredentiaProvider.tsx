import React, { createContext, useContext } from 'react';
import type { CredentiaSDK } from '../CredentiaSDK';

const Ctx = createContext<CredentiaSDK | null>(null);

/** Supplies one CredentiaSDK instance to the hooks below. Create the instance once, outside render. */
export function CredentiaProvider({ sdk, children }: { sdk: CredentiaSDK; children?: React.ReactNode }) {
  return <Ctx.Provider value={sdk}>{children}</Ctx.Provider>;
}

export function useCredentia(): CredentiaSDK {
  const sdk = useContext(Ctx);
  if (!sdk) throw new Error('useTrustScore/useCredential must be used inside <CredentiaProvider sdk={...}>.');
  return sdk;
}
