import { Router } from 'express';
import { identityController } from '../controllers/identity.controller.js';

const router = Router();

// Identity management routes
router.post('/', identityController.register);
router.get('/:did', identityController.getByDID);
router.put('/:did', identityController.update);
router.delete('/:did', identityController.deactivate);
router.get('/address/:address', identityController.getByAddress);

export default router;
