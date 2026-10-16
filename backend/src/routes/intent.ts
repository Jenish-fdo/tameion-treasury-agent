import { Router } from 'express';
import { evaluateIntentHandler } from '../controllers/intent.controller.js';
import { intentRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Body validation (Zod) happens in the handler; errors flow to the shared error handler.
router.post('/evaluate', intentRateLimiter, evaluateIntentHandler);

export default router;
