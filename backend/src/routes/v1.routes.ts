import { Router } from 'express';
import { mintCredentialHandler, verifyCredentialHandler } from '../controllers/credential.controller.js';

const router = Router();

router.post('/credential/mint', mintCredentialHandler);
router.get('/credential/:credentialId/verify', verifyCredentialHandler);

export default router;
