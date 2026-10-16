import { Router } from 'express';
import { getAgentCredentialsHandler } from '../controllers/agent.controller.js';
import { mintCredentialHandler, verifyCredentialHandler } from '../controllers/credential.controller.js';
import { getTrustScoreHandler } from '../controllers/trustScore.controller.js';

const router = Router();

router.post('/credential/mint', mintCredentialHandler);
router.get('/credential/:credentialId/verify', verifyCredentialHandler);
router.get('/trust-score/:address', getTrustScoreHandler);
router.get('/agent/:address/credentials', getAgentCredentialsHandler);

export default router;
