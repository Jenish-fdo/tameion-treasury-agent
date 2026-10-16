import { InvalidParamsError, MethodNotFoundError } from '@metamask/snaps-sdk';
import type { Json, OnRpcRequestHandler } from '@metamask/snaps-sdk';
import { getConfig, SNAP_VERSION } from '../config';
import { lookupTrustProfile } from '../services/credentiaApi';
import { isHexAddress } from '../utils/transaction';

/**
 * Public, read-only RPC for dapps:
 *   credentia_getTrustProfile { address, chainId? } -> lookup result (never a raw API response)
 *   credentia_getVersion                            -> { version }
 * Anything else is rejected. No method signs, stores data, or exposes configuration.
 */
export const onRpcRequest: OnRpcRequestHandler = async ({ request }) => {
  switch (request.method) {
    case 'credentia_getVersion':
      return { version: SNAP_VERSION };

    case 'credentia_getTrustProfile': {
      const params = request.params;
      if (typeof params !== 'object' || params === null || Array.isArray(params)) throw new InvalidParamsError('Expected an object with an address.');
      const { address, chainId } = params as { address?: unknown; chainId?: unknown };
      if (!isHexAddress(address)) throw new InvalidParamsError('address must be a 0x-prefixed 20-byte address.');
      if (chainId !== undefined && typeof chainId !== 'string') throw new InvalidParamsError('chainId must be a CAIP-2 string such as "eip155:10143".');

      const cfg = getConfig();
      const chain = chainId ?? Object.keys(cfg.networks)[0];
      const result = await lookupTrustProfile(cfg, address, chain, (url, init) => fetch(url, init));
      return JSON.parse(JSON.stringify(result)) as Json; // drops undefined fields so the value is valid JSON
    }

    default:
      throw new MethodNotFoundError();
  }
};
