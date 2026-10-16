import type { Request, Response, NextFunction } from 'express';
import { paymentIntentSchema } from '../schemas/api.js';
import { IntentService } from '../services/intentService.js';

export const evaluateIntentHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = paymentIntentSchema.parse(req.body);
    res.status(200).json(await IntentService.evaluate(body));
  } catch (error) {
    next(error);
  }
};
