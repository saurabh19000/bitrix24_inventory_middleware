import { Router } from 'express';
import { debugController } from '../controllers/debug.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/logs', debugController.listLogs);
router.get('/logs/stats', debugController.getStats);
router.post('/logs/clear', debugController.clearLogs);

export default router;