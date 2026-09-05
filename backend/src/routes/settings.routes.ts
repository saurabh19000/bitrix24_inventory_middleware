import { Router } from 'express';
import { settingsController } from '../controllers/settings.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { z } from 'zod';

const router = Router();

router.use(authMiddleware);

const saveSchema = z.object({
  body: z.object({
    portalUrl: z.string().min(1, 'Portal URL is required'),
    webhookUrl: z.string().optional(),
    isActive: z.boolean().optional(),
  }),
});

const updateSchema = z.object({
  body: z.object({
    portalUrl: z.string().optional(),
    webhookUrl: z.string().optional(),
    isActive: z.boolean().optional(),
  }),
});

router.get('/bitrix', settingsController.getBitrixSettings);
router.post('/bitrix', validate(saveSchema), settingsController.saveBitrixSettings);
router.put('/bitrix', validate(updateSchema), settingsController.updateBitrixSettings);
router.delete('/bitrix', settingsController.deleteBitrixSettings);
router.post('/bitrix/test', settingsController.testBitrixConnection);

export default router;
