import type { Request, Response, NextFunction } from 'express';
import { addressParamSchema } from '../schemas/api.js';
import { TrustScoreService } from '../services/trustScoreService.js';

export const getTrustScoreHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { address } = addressParamSchema.parse(req.params);
    res.status(200).json(await TrustScoreService.get(address));
  } catch (error) {
    next(error);
  }
};
