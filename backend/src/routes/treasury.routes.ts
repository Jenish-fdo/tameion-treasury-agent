import { Router } from 'express';
import {
  createBusinessHandler, createDecisionHandler, createMandateHandler, getBusinessHandler, getDecisionHandler, getMandateHandler,
  listDecisionsHandler, listMandatesHandler, listOwnersHandler, pendingApprovalsHandler, revokeMandateHandler, validatePaymentHandler,
} from '../controllers/treasury.controller.js';

/** Businesses, mandates, decisions and pending approvals (Arc testnet, unaudited). Mounted behind API-key auth and rate limits. */
const router = Router();

router.get('/businesses/owners', listOwnersHandler); // before /:businessId
router.post('/businesses', createBusinessHandler);
router.get('/businesses/:businessId', getBusinessHandler);

router.post('/mandates', createMandateHandler);
router.get('/mandates', listMandatesHandler);
router.get('/mandates/:mandateId', getMandateHandler);
router.post('/mandates/:mandateId/revoke', revokeMandateHandler);
router.post('/mandates/:mandateId/validate', validatePaymentHandler);

router.post('/decisions', createDecisionHandler);
router.get('/decisions', listDecisionsHandler);
router.get('/decisions/:decisionId', getDecisionHandler);

router.get('/approvals/pending', pendingApprovalsHandler);

export default router;
