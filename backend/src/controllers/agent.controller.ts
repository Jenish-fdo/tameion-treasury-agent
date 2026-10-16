import type { Request, Response, NextFunction } from 'express';
import { addressParamSchema } from '../schemas/api.js';
import { AgentService } from '../services/agentService.js';

export const getAgentCredentialsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { address } = addressParamSchema.parse(req.params);
    res.status(200).json(await AgentService.getCredentials(address));
  } catch (error) {
    next(error);
  }
};
