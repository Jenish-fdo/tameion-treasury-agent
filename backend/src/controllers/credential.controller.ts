import type { Request, Response, NextFunction } from 'express';
import { credentialIdParamSchema, mintBodySchema } from '../schemas/api.js';
import { CredentialService } from '../services/credentialService.js';

export const mintCredentialHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = mintBodySchema.parse(req.body);
    const result = await CredentialService.mint(body);
    // 201 once confirmed on-chain, 202 while the transaction is still pending.
    res.status(result.status === 'confirmed' ? 201 : 202).json(result);
  } catch (error) {
    next(error);
  }
};

export const verifyCredentialHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { credentialId } = credentialIdParamSchema.parse(req.params);
    res.status(200).json(await CredentialService.verify(credentialId));
  } catch (error) {
    next(error);
  }
};
