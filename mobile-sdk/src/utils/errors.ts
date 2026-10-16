export type CredentiaErrorCode =
  | 'VALIDATION' | 'TIMEOUT' | 'NETWORK' | 'UNAUTHORIZED' | 'RATE_LIMITED' | 'NOT_FOUND' | 'SERVER' | 'BAD_RESPONSE' | 'CANCELLED';

/** Every SDK failure is a CredentiaError. Messages are fixed text: never server output, URLs or keys. */
export class CredentiaError extends Error {
  constructor(public readonly code: CredentiaErrorCode, message: string, public readonly status?: number) {
    super(message);
    this.name = 'CredentiaError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const BY_STATUS: Record<number, [CredentiaErrorCode, string]> = {
  400: ['VALIDATION', 'The request was rejected as invalid.'],
  401: ['UNAUTHORIZED', 'The API rejected the credentials (missing or invalid API key).'],
  403: ['UNAUTHORIZED', 'The API rejected the credentials (missing or invalid API key).'],
  404: ['NOT_FOUND', 'The requested record was not found.'],
  429: ['RATE_LIMITED', 'Too many requests. Try again later.'],
};

/** Maps an HTTP status to a CredentiaError with a safe, fixed message. */
export function errorForStatus(status: number): CredentiaError {
  const known = BY_STATUS[status];
  if (known) return new CredentiaError(known[0], known[1], status);
  if (status >= 500) return new CredentiaError('SERVER', 'The Credentia API had a problem. Try again later.', status);
  return new CredentiaError('BAD_RESPONSE', 'The API returned an unexpected response.', status);
}

export const isCredentiaError = (e: unknown): e is CredentiaError => e instanceof CredentiaError;
