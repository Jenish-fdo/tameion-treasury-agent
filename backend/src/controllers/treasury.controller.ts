import type { Request, Response, NextFunction } from 'express';
import {
  businessIdParamSchema, createBusinessSchema, createDecisionSchema, createMandateSchema, decisionIdParamSchema, listDecisionsQuerySchema,
  listMandatesQuerySchema, mandateIdParamSchema, pendingApprovalsQuerySchema, revokeMandateSchema, validatePaymentSchema,
} from '../schemas/treasury.js';
import { DecisionService } from '../services/decisionService.js';
import { MandateService } from '../services/mandateService.js';

type Handler = (req: Request, res: Response) => Promise<void>;
/** Sends any thrown error (including Zod validation errors) to the shared error handler. */
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction): void => {
  fn(req, res).catch(next);
};

export const listOwnersHandler = wrap(async (_req, res) => {
  res.json({ owners: MandateService.managedOwners(), note: 'Testnet demo owners the API holds keys for.' });
});

export const createBusinessHandler = wrap(async (req, res) => {
  const result = await MandateService.registerBusiness(createBusinessSchema.parse(req.body));
  res.status(result.status === 'confirmed' ? 201 : 202).json(result);
});

export const getBusinessHandler = wrap(async (req, res) => {
  const { businessId } = businessIdParamSchema.parse(req.params);
  res.json(await MandateService.getBusiness(businessId));
});

export const createMandateHandler = wrap(async (req, res) => {
  const result = await MandateService.createMandate(createMandateSchema.parse(req.body));
  res.status('status' in result && result.status === 'pending' ? 202 : 201).json(result);
});

export const listMandatesHandler = wrap(async (req, res) => {
  res.json(await MandateService.list(listMandatesQuerySchema.parse(req.query)));
});

export const getMandateHandler = wrap(async (req, res) => {
  const { mandateId } = mandateIdParamSchema.parse(req.params);
  res.json(await MandateService.get(mandateId));
});

export const revokeMandateHandler = wrap(async (req, res) => {
  const { mandateId } = mandateIdParamSchema.parse(req.params);
  const { reason } = revokeMandateSchema.parse(req.body ?? {});
  res.json(await MandateService.revoke(mandateId, reason));
});

export const validatePaymentHandler = wrap(async (req, res) => {
  const { mandateId } = mandateIdParamSchema.parse(req.params);
  res.json(await MandateService.validate(mandateId, validatePaymentSchema.parse(req.body)));
});

export const createDecisionHandler = wrap(async (req, res) => {
  const result = await DecisionService.record(createDecisionSchema.parse(req.body));
  res.status(result.status === 'confirmed' ? 201 : 202).json(result);
});

export const listDecisionsHandler = wrap(async (req, res) => {
  res.json(await DecisionService.list(listDecisionsQuerySchema.parse(req.query)));
});

export const getDecisionHandler = wrap(async (req, res) => {
  const { decisionId } = decisionIdParamSchema.parse(req.params);
  res.json(await DecisionService.get(decisionId));
});

export const pendingApprovalsHandler = wrap(async (req, res) => {
  const { businessId } = pendingApprovalsQuerySchema.parse(req.query);
  res.json(await DecisionService.pendingApprovals(businessId));
});
