import type { Request, Response } from 'express';
import { sendError } from './errorHandler.js';

export const notFoundHandler = (req: Request, res: Response): void => {
  sendError(req, res, 404, 'ROUTE_NOT_FOUND', 'Route not found');
};
