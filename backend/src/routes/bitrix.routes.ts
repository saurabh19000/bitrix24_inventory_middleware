import { Router } from 'express';
import { bitrixController } from '../controllers/bitrix.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/catalogs', bitrixController.getCatalogs);
router.get('/products/fields', bitrixController.getProductFields);
router.get('/inventory/fields', bitrixController.getInventoryFields);
router.get('/stores', bitrixController.getStores);
router.get('/invoice-fields', bitrixController.getInvoiceFields);

export default router;
