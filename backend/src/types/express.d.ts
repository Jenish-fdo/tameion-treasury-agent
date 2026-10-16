declare global {
  namespace Express {
    interface Request {
      id: string;
      auth?: { keyId: string; tier: 'free' | 'pro' };
    }
  }
}
export {};
